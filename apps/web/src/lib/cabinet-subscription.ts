import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { applySubscriptionState } from '@/lib/stripe-webhook';

// Gestion de l'abonnement depuis l'application (D59) : pas de portail client
// Stripe. SocialFlow pilote lui-meme la resiliation et la reprise ; seule la
// SAISIE d'une carte se fait chez Stripe (page hebergee), pour que le numero
// ne transite jamais par SocialFlow. Une carte n'est jamais supprimee : on
// en ajoute une et on la designe comme moyen de paiement par defaut.
//
// Tout part du cabinet de la session (stripeCustomerId), jamais de la requete.

export type SubscriptionError =
  | 'CABINET_NOT_FOUND'
  | 'NO_STRIPE_CUSTOMER'
  | 'NO_SUBSCRIPTION'
  | 'ALREADY_CANCELLING'
  | 'NOT_CANCELLING'
  | 'SESSION_NOT_FOUND'
  | 'CARD_SETUP_NOT_COMPLETED'
  | 'STRIPE_FAILED';

type Failure = { ok: false; error: SubscriptionError };

const LIVE_STATUSES = ['trialing', 'active', 'past_due', 'unpaid'] as const;

async function loadCabinet(cabinetId: string) {
  return prisma.cabinet.findFirst({
    where: { id: cabinetId, deletedAt: null },
    select: { id: true, stripeCustomerId: true, billingStatus: true, cancelAtPeriodEnd: true },
  });
}

// Abonnement en cours du client (le seul que SocialFlow cree par cabinet).
async function findLiveSubscription(customerId: string): Promise<Stripe.Subscription | null> {
  const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
  return (
    list.data.find((s) => (LIVE_STATUSES as readonly string[]).includes(s.status)) ?? null
  );
}

// --- Resiliation / reprise -------------------------------------------------

async function setCancelAtPeriodEnd(
  cabinetId: string,
  actorId: string,
  cancel: boolean,
): Promise<{ ok: true } | Failure> {
  const cabinet = await loadCabinet(cabinetId);
  if (!cabinet) return { ok: false, error: 'CABINET_NOT_FOUND' };
  if (!cabinet.stripeCustomerId) return { ok: false, error: 'NO_STRIPE_CUSTOMER' };

  try {
    const subscription = await findLiveSubscription(cabinet.stripeCustomerId);
    if (!subscription) return { ok: false, error: 'NO_SUBSCRIPTION' };

    if (subscription.cancel_at_period_end === cancel) {
      return { ok: false, error: cancel ? 'ALREADY_CANCELLING' : 'NOT_CANCELLING' };
    }

    await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: cancel });
  } catch (error) {
    // Jamais de detail Stripe dans la reponse : seulement dans les logs.
    console.error("Echec de la mise a jour de la resiliation de l'abonnement", error);
    return { ok: false, error: 'STRIPE_FAILED' };
  }

  // L'etat local est pose tout de suite (le webhook le confirmera) et l'audit
  // part dans la meme transaction (CONVENTIONS.md § 3).
  await prisma.$transaction([
    prisma.cabinet.update({ where: { id: cabinetId }, data: { cancelAtPeriodEnd: cancel } }),
    prisma.auditLog.create({
      data: {
        action: cancel ? 'SUBSCRIPTION_CANCEL_SCHEDULED' : 'SUBSCRIPTION_CANCEL_REVERTED',
        cabinetId,
        actorId,
      },
    }),
  ]);

  return { ok: true };
}

// Resiliation en fin de periode : le cabinet garde l'acces jusqu'au terme.
export const scheduleCancellation = (cabinetId: string, actorId: string) =>
  setCancelAtPeriodEnd(cabinetId, actorId, true);

// Reprise avant le terme : l'abonnement continue normalement.
export const resumeSubscription = (cabinetId: string, actorId: string) =>
  setCancelAtPeriodEnd(cabinetId, actorId, false);

// --- Carte bancaire --------------------------------------------------------

export type CardSessionResult = { ok: true; url: string } | Failure;

// Page Stripe de saisie d'une carte (Checkout en mode "setup" : aucun
// paiement, la carte est seulement enregistree). Retour sur la page
// Facturation, ou la session est confirmee cote serveur.
export async function createCardUpdateSession(
  cabinetId: string,
  appUrl: string,
): Promise<CardSessionResult> {
  const cabinet = await loadCabinet(cabinetId);
  if (!cabinet) return { ok: false, error: 'CABINET_NOT_FOUND' };
  if (!cabinet.stripeCustomerId) return { ok: false, error: 'NO_STRIPE_CUSTOMER' };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: cabinet.stripeCustomerId,
      currency: 'eur',
      payment_method_types: ['card'],
      client_reference_id: cabinetId,
      metadata: { cabinetId },
      success_url: `${appUrl}/dashboard/cabinet/facturation?carte=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard/cabinet/facturation?carte=annulee`,
    });
    if (!session.url) return { ok: false, error: 'STRIPE_FAILED' };
    return { ok: true, url: session.url };
  } catch (error) {
    console.error('Echec de la creation de la session de saisie de carte', error);
    return { ok: false, error: 'STRIPE_FAILED' };
  }
}

export type CardConfirmResult = { ok: true; changed: boolean } | Failure;

// Au retour de Stripe : la nouvelle carte devient le moyen de paiement par
// defaut du client et de son abonnement. Idempotent (un rechargement de la
// page ne rejoue ni l'audit ni le changement). Quand le cabinet est en retard
// de paiement, la facture ouverte est representee aussitot avec cette carte,
// sans attendre la prochaine relance de Stripe ; l'etat local est ensuite
// resynchronise depuis l'abonnement Stripe.
export async function confirmCardUpdate(
  cabinetId: string,
  actorId: string,
  sessionId: string,
): Promise<CardConfirmResult> {
  const cabinet = await loadCabinet(cabinetId);
  if (!cabinet) return { ok: false, error: 'CABINET_NOT_FOUND' };
  if (!cabinet.stripeCustomerId) return { ok: false, error: 'NO_STRIPE_CUSTOMER' };
  const customerId = cabinet.stripeCustomerId;

  try {
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent'] });
    } catch {
      return { ok: false, error: 'SESSION_NOT_FOUND' };
    }

    // Une session d'un autre cabinet est "introuvable", jamais "interdite".
    const sessionCustomer =
      typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (session.mode !== 'setup' || sessionCustomer !== customerId) {
      return { ok: false, error: 'SESSION_NOT_FOUND' };
    }
    if (session.status !== 'complete') return { ok: false, error: 'CARD_SETUP_NOT_COMPLETED' };

    const intent = session.setup_intent;
    const paymentMethod =
      intent && typeof intent !== 'string'
        ? typeof intent.payment_method === 'string'
          ? intent.payment_method
          : intent.payment_method?.id
        : null;
    if (!paymentMethod) return { ok: false, error: 'CARD_SETUP_NOT_COMPLETED' };

    const customer = await stripe.customers.retrieve(customerId);
    const current =
      !('deleted' in customer) && customer.invoice_settings?.default_payment_method;
    const currentId = typeof current === 'string' ? current : current ? current.id : null;
    const changed = currentId !== paymentMethod;

    if (changed) {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethod },
      });
      const subscription = await findLiveSubscription(customerId);
      if (subscription) {
        await stripe.subscriptions.update(subscription.id, {
          default_payment_method: paymentMethod,
        });
      }

      const overdue = cabinet.billingStatus === 'DELAI_GRACE' || cabinet.billingStatus === 'IMPAYE';
      if (overdue) {
        const open = await stripe.invoices.list({ customer: customerId, status: 'open', limit: 1 });
        const invoice = open.data[0];
        if (invoice) {
          // Un echec ici n'annule pas le changement de carte : Stripe relancera.
          await stripe.invoices
            .pay(invoice.id, { payment_method: paymentMethod })
            .catch((error) => console.error('Echec du paiement de la facture ouverte', error));
        }
      }

      await prisma.auditLog.create({
        data: { action: 'PAYMENT_METHOD_UPDATED', cabinetId, actorId },
      });
    }

    // L'etat local suit Stripe (D57) : on le relit apres le changement, par le
    // meme code que le webhook. Un cabinet en delai de grace dont l'abonnement
    // est sain chez Stripe est ainsi regularise tout de suite, et une
    // resiliation programmee est rapatriee. Aussi rejoue quand la carte etait
    // deja a jour, pour reparer un etat reste en retard.
    const fresh = await findLiveSubscription(customerId);
    if (fresh) await applySubscriptionState(fresh, new Date(), 'payment_method_updated');

    return { ok: true, changed };
  } catch (error) {
    console.error("Echec de la confirmation du changement de carte", error);
    return { ok: false, error: 'STRIPE_FAILED' };
  }
}

// --- Lecture : carte et factures -------------------------------------------

export type PaymentMethodSummary = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

export type InvoiceRow = {
  id: string;
  number: string | null;
  date: Date;
  // Montant en centimes entiers (CLAUDE.md).
  amountCents: number;
  currency: string;
  status: string;
  pdfUrl: string | null;
};

export type BillingExtras = {
  card: PaymentMethodSummary | null;
  invoices: InvoiceRow[];
  // false quand Stripe est injoignable : la page s'affiche sans ces blocs.
  available: boolean;
};

// Lu en direct dans Stripe (comme la facturation cote SuperAdmin) : aucune
// donnee de carte ni de facture n'est dupliquee en base.
export async function getBillingExtras(cabinetId: string): Promise<BillingExtras> {
  const cabinet = await loadCabinet(cabinetId);
  if (!cabinet?.stripeCustomerId) return { card: null, invoices: [], available: true };
  const customerId = cabinet.stripeCustomerId;

  try {
    const [customer, invoices] = await Promise.all([
      stripe.customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] }),
      stripe.invoices.list({ customer: customerId, limit: 24 }),
    ]);

    let card: PaymentMethodSummary | null = null;
    if (!('deleted' in customer)) {
      const pm = customer.invoice_settings?.default_payment_method;
      if (pm && typeof pm !== 'string' && pm.card) {
        card = {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        };
      }
    }

    return {
      card,
      available: true,
      invoices: invoices.data
        // Les brouillons ne sont pas des factures pour le client.
        .filter((i) => i.status !== 'draft')
        .map((i) => ({
          id: i.id as string,
          number: i.number,
          date: new Date(i.created * 1000),
          amountCents: i.total,
          currency: i.currency,
          status: i.status ?? 'open',
          pdfUrl: i.invoice_pdf ?? null,
        })),
    };
  } catch (error) {
    console.error('Echec de la lecture de la carte et des factures', error);
    return { card: null, invoices: [], available: false };
  }
}
