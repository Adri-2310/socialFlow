import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { normalizeBillingPeriod, normalizeBillingStatus } from '@/lib/billing';
import { applySubscriptionState } from '@/lib/stripe-webhook';

// Stripe Checkout avec carte et essai de 30 jours (D25, D32, C1). Remplace
// l'essai cree sans moyen de paiement a l'inscription : Stripe ne pouvait
// alors rien debiter a la fin de l'essai.
//
// Le plan et la periode viennent TOUJOURS du cabinet (D55), jamais de la
// requete du client.

export const TRIAL_DAYS = 30;

export type CheckoutError =
  | 'CABINET_NOT_FOUND'
  | 'PLAN_REQUIRED'
  | 'SUBSCRIPTION_ALREADY_STARTED'
  | 'PRICE_NOT_FOUND'
  | 'CHECKOUT_FAILED';

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: CheckoutError };

async function findPriceId(planId: string, billingPeriod: 'monthly' | 'yearly') {
  const prices = await stripe.prices.list({ limit: 100, active: true });
  return (
    prices.data.find(
      (p) => p.metadata.planId === planId && p.metadata.billingPeriod === billingPeriod,
    )?.id ?? null
  );
}

export async function createCheckoutSession(
  cabinetId: string,
  appUrl: string,
): Promise<CheckoutResult> {
  const cabinet = await prisma.cabinet.findUnique({
    where: { id: cabinetId },
    select: {
      name: true,
      planId: true,
      billingPeriod: true,
      billingStatus: true,
      stripeCustomerId: true,
      deletedAt: true,
    },
  });
  if (!cabinet || cabinet.deletedAt) return { ok: false, error: 'CABINET_NOT_FOUND' };
  if (!cabinet.planId) return { ok: false, error: 'PLAN_REQUIRED' };

  // Un cabinet deja en essai, actif ou en impaye regularise via le portail
  // Stripe : un second Checkout creerait un deuxieme abonnement.
  if (normalizeBillingStatus(cabinet.billingStatus) !== 'EN_ATTENTE_PAIEMENT') {
    return { ok: false, error: 'SUBSCRIPTION_ALREADY_STARTED' };
  }

  const billingPeriod = normalizeBillingPeriod(cabinet.billingPeriod) ?? 'monthly';
  const priceId = await findPriceId(cabinet.planId, billingPeriod);
  if (!priceId) return { ok: false, error: 'PRICE_NOT_FOUND' };

  try {
    // Client cree avant la session : l'abonnement et ses evenements portent
    // ainsi un client deja relie au cabinet (webhook, portail).
    let customerId = cabinet.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: cabinet.name,
        metadata: { cabinetId },
      });
      customerId = customer.id;
      await prisma.cabinet.update({
        where: { id: cabinetId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: cabinetId,
      line_items: [{ price: priceId, quantity: 1 }],
      // D25 : carte obligatoire des l'essai, pour pouvoir debiter a son terme.
      payment_method_collection: 'always',
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { cabinetId },
      },
      metadata: { cabinetId },
      locale: 'fr',
      // Retour : confirmation immediate cote serveur (sans attendre le
      // webhook), puis tableau de bord ; annulation : ecran de reprise (D32).
      success_url: `${appUrl}/dashboard/cabinet?paiement=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard/cabinet?paiement=annule`,
    });

    if (!session.url) return { ok: false, error: 'CHECKOUT_FAILED' };
    return { ok: true, url: session.url };
  } catch (error) {
    console.error('Echec de la creation de la session Checkout', error);
    return { ok: false, error: 'CHECKOUT_FAILED' };
  }
}

export type ConfirmError = 'SESSION_NOT_FOUND' | 'CHECKOUT_NOT_COMPLETED' | 'CHECKOUT_FAILED';
export type ConfirmResult = { ok: true } | { ok: false; error: ConfirmError };

// Au retour de Checkout : lit la session aupres de Stripe et applique
// l'abonnement au cabinet, comme le ferait le webhook. Sans cela, en local
// (sans `stripe listen`) ou si le webhook est en retard, le client reviendrait
// sur un cabinet encore "en attente de paiement".
//
// La session doit appartenir au cabinet de l'utilisateur : un identifiant de
// session d'un autre cabinet est "introuvable".
export async function confirmCheckoutSession(
  cabinetId: string,
  sessionId: string,
): Promise<ConfirmResult> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
  } catch {
    return { ok: false, error: 'SESSION_NOT_FOUND' };
  }

  const owner = session.client_reference_id ?? session.metadata?.cabinetId ?? null;
  if (owner !== cabinetId) return { ok: false, error: 'SESSION_NOT_FOUND' };

  const subscription = session.subscription;
  if (session.status !== 'complete' || !subscription || typeof subscription === 'string') {
    return { ok: false, error: 'CHECKOUT_NOT_COMPLETED' };
  }

  try {
    // Date de creation de l'abonnement comme date d'evenement : le
    // customer.subscription.created de Stripe, de meme date, s'applique
    // ensuite sans etre juge perime.
    await applySubscriptionState(
      subscription,
      new Date(subscription.created * 1000),
      'checkout.session.confirmed',
    );
    return { ok: true };
  } catch (error) {
    console.error('Echec de la confirmation du Checkout', error);
    return { ok: false, error: 'CHECKOUT_FAILED' };
  }
}
