import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import {
  graceEndsAt,
  mapStripeSubscriptionStatus,
  normalizeBillingPeriod,
  normalizeBillingStatus,
  type BillingStatus,
} from '@/lib/billing/billing';
import { sendPaymentFailedEmail } from '@/lib/email/email';

// Suivi de l'abonnement par webhook Stripe (D55, D57) : le plan local suit
// toujours Stripe, jamais l'inverse (roles/02-cabinet-rh.md § 4.5). Ce module
// ne touche jamais Cabinet.status : une suspension manuelle du SuperAdmin ne
// doit pas etre levee par un paiement.

type StatusResolver = BillingStatus | ((current: BillingStatus) => BillingStatus | null);

type BillingUpdate = {
  status: StatusResolver;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  planId?: string | null;
  billingPeriod?: 'monthly' | 'yearly' | null;
  cancelAtPeriodEnd?: boolean;
};

type ApplyResult = {
  applied: boolean;
  changed: boolean;
  previous: BillingStatus;
  current: BillingStatus;
  pastDueSince: Date | null;
};

const idOf = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === 'string' ? value : (value?.id ?? null);

async function findCabinetId(
  customer: string | { id: string } | null | undefined,
  metadataCabinetId?: string | null,
): Promise<string | null> {
  const customerId = idOf(customer);
  if (customerId) {
    const cabinet = await prisma.cabinet.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    if (cabinet) return cabinet.id;
  }
  if (metadataCabinetId) {
    const cabinet = await prisma.cabinet.findUnique({
      where: { id: metadataCabinetId },
      select: { id: true },
    });
    if (cabinet) return cabinet.id;
  }
  return null;
}

// Applique un etat d'abonnement a un cabinet, une seule fois par evenement
// et jamais a l'envers : un evenement plus ancien que le dernier applique est
// ignore (les webhooks peuvent arriver dans le desordre). L'audit est ecrit
// dans la meme transaction que le changement (CONVENTIONS.md § 3).
async function applyBillingUpdate(
  cabinetId: string,
  eventAt: Date,
  eventType: string,
  update: BillingUpdate,
): Promise<ApplyResult | null> {
  return prisma.$transaction(async (tx) => {
    const cabinet = await tx.cabinet.findUnique({
      where: { id: cabinetId },
      select: {
        billingStatus: true,
        pastDueSince: true,
        billingEventAt: true,
        planId: true,
        pendingPlanId: true,
        currentPeriodEnd: true,
      },
    });
    if (!cabinet) return null;

    const previous = normalizeBillingStatus(cabinet.billingStatus);
    if (cabinet.billingEventAt && eventAt.getTime() < cabinet.billingEventAt.getTime()) {
      return { applied: false, changed: false, previous, current: previous, pastDueSince: cabinet.pastDueSince };
    }

    const resolved = typeof update.status === 'function' ? update.status(previous) : update.status;
    const current = resolved ?? previous;

    // Debut du delai de grace : pose a l'entree, conserve tant que dure
    // l'impaye, efface des que l'abonnement est regularise ou resilie.
    let pastDueSince = cabinet.pastDueSince;
    if (current === 'DELAI_GRACE') pastDueSince = pastDueSince ?? eventAt;
    else if (current !== 'IMPAYE') pastDueSince = null;

    // D75 : le plan vise par un changement programme n'est plus "en attente"
    // quand il vient d'etre applique, quand un autre plan s'applique, ou quand la
    // periode est renouvelee sans lui (changement libere cote Stripe).
    const planChanged = !!update.planId && update.planId !== cabinet.planId;
    const pendingApplied = !!update.planId && update.planId === cabinet.pendingPlanId;
    const renewed =
      !!update.currentPeriodEnd &&
      !!cabinet.currentPeriodEnd &&
      update.currentPeriodEnd.getTime() > cabinet.currentPeriodEnd.getTime();
    const clearPending = !!cabinet.pendingPlanId && (planChanged || pendingApplied || renewed);

    await tx.cabinet.update({
      where: { id: cabinetId },
      data: {
        ...(clearPending ? { pendingPlanId: null } : {}),
        billingStatus: current,
        pastDueSince,
        billingEventAt: eventAt,
        ...(update.trialEndsAt !== undefined ? { trialEndsAt: update.trialEndsAt } : {}),
        ...(update.currentPeriodEnd !== undefined
          ? { currentPeriodEnd: update.currentPeriodEnd }
          : {}),
        ...(update.planId ? { planId: update.planId } : {}),
        ...(update.billingPeriod ? { billingPeriod: update.billingPeriod } : {}),
        ...(update.cancelAtPeriodEnd !== undefined
          ? { cancelAtPeriodEnd: update.cancelAtPeriodEnd }
          : {}),
      },
    });

    const changed = current !== previous;
    if (changed) {
      await tx.auditLog.create({
        data: {
          action: 'BILLING_STATUS_CHANGED',
          cabinetId,
          metadata: { from: previous, to: current, eventType },
        },
      });
    }

    return { applied: true, changed, previous, current, pastDueSince };
  });
}

// D23 : le titulaire ET les SuperAdmins sont prevenus quand un paiement echoue.
// Un echec d'envoi ne fait jamais echouer le traitement : l'etat est deja
// enregistre, et Stripe rejouerait l'evenement sans rien changer.
async function notifyPaymentFailed(cabinetId: string, pastDueSince: Date): Promise<void> {
  const [cabinet, owner, admins] = await Promise.all([
    prisma.cabinet.findUnique({ where: { id: cabinetId }, select: { name: true } }),
    prisma.user.findFirst({
      where: { cabinetId, role: 'CABINET_RH', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { email: true, name: true },
    }),
    prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', deletedAt: null, status: 'actif' },
      select: { email: true, name: true },
    }),
  ]);
  if (!cabinet) return;

  const deadline = graceEndsAt(pastDueSince);
  const sends = [
    ...(owner
      ? [sendPaymentFailedEmail(owner.email, owner.name, cabinet.name, deadline, 'cabinet')]
      : []),
    ...admins.map((a) => sendPaymentFailedEmail(a.email, a.name, cabinet.name, deadline, 'admin')),
  ];

  const results = await Promise.allSettled(sends);
  for (const r of results) {
    if (r.status === 'rejected') console.error("Echec de l'email d'impaye", r.reason);
  }
}

// Plan et periode lus sur le prix de l'abonnement (metadata posee a la
// creation du Product/Price, voir api/admin/plans) : un changement de plan
// fait via Stripe est ainsi repris, sans que le client puisse le forcer.
async function planFromSubscription(
  subscription: Stripe.Subscription,
): Promise<{ planId: string | null; billingPeriod: 'monthly' | 'yearly' | null }> {
  const price = subscription.items?.data?.[0]?.price;
  const planId = price?.metadata?.planId ?? null;
  const billingPeriod = normalizeBillingPeriod(price?.metadata?.billingPeriod);
  if (!planId) return { planId: null, billingPeriod };

  const exists = await prisma.pricingPlan.findUnique({ where: { planId }, select: { id: true } });
  return { planId: exists ? planId : null, billingPeriod };
}

const fromUnix = (value: number | null | undefined): Date | null =>
  typeof value === 'number' ? new Date(value * 1000) : null;

// Applique l'etat d'un abonnement Stripe a son cabinet. Partage entre le
// webhook (customer.subscription.created/updated) et la confirmation d'un
// Checkout au retour du client : le meme code, donc le meme resultat quel que
// soit le premier arrive. Renvoie false si aucun cabinet ne correspond.
export async function applySubscriptionState(
  subscription: Stripe.Subscription,
  eventAt: Date,
  eventType: string,
): Promise<boolean> {
  const cabinetId = await findCabinetId(subscription.customer, subscription.metadata?.cabinetId);
  if (!cabinetId) return false;

  const mapped = mapStripeSubscriptionStatus(subscription.status);
  if (!mapped) return true;
  const plan = await planFromSubscription(subscription);

  const result = await applyBillingUpdate(cabinetId, eventAt, eventType, {
    // Une resiliation deja actee ne doit pas etre annulee par un evenement
    // tardif de statut "actif".
    status: (current) => (current === 'RESILIE' && mapped !== 'RESILIE' ? null : mapped),
    trialEndsAt: fromUnix(subscription.trial_end),
    currentPeriodEnd: fromUnix(subscription.items?.data?.[0]?.current_period_end),
    // D59 : resiliation programmee dans l'application, relue depuis Stripe.
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    ...plan,
  });
  if (result?.changed && result.current === 'DELAI_GRACE' && result.pastDueSince) {
    await notifyPaymentFailed(cabinetId, result.pastDueSince);
  }
  return true;
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  const eventAt = new Date(event.created * 1000);

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      await applySubscriptionState(event.data.object, eventAt, event.type);
      return;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const cabinetId = await findCabinetId(invoice.customer);
      if (!cabinetId) return;

      const result = await applyBillingUpdate(cabinetId, eventAt, event.type, {
        // Seuls les etats "en regle" basculent en delai de grace : un cabinet
        // deja impaye ou resilie ne revient pas en arriere.
        status: (current) =>
          ['ESSAI', 'ACTIF', 'EN_ATTENTE_PAIEMENT', 'DELAI_GRACE'].includes(current)
            ? 'DELAI_GRACE'
            : null,
      });
      if (result?.changed && result.current === 'DELAI_GRACE' && result.pastDueSince) {
        await notifyPaymentFailed(cabinetId, result.pastDueSince);
      }
      return;
    }

    case 'invoice.paid': {
      const invoice = event.data.object;
      // La facture a 0 EUR emise au demarrage d'un essai est "payee" sans
      // qu'aucun paiement n'ait eu lieu : elle ne doit pas passer le cabinet
      // en actif pendant l'essai.
      if (!invoice.amount_paid || invoice.amount_paid <= 0) return;

      const cabinetId = await findCabinetId(invoice.customer);
      if (!cabinetId) return;

      await applyBillingUpdate(cabinetId, eventAt, event.type, {
        status: (current) => (current === 'RESILIE' ? null : 'ACTIF'),
      });
      return;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const cabinetId = await findCabinetId(subscription.customer, subscription.metadata?.cabinetId);
      if (!cabinetId) return;

      await applyBillingUpdate(cabinetId, eventAt, event.type, { status: 'RESILIE' });
      return;
    }

    default:
      // Evenement non suivi : on l'accuse reception sans rien changer.
      return;
  }
}

export type ProcessResult = { duplicate: boolean };

// Point d'entree : idempotent. Un evenement deja traite est ignore ; un
// evenement recu mais dont le traitement avait echoue est repris.
export async function processStripeEvent(event: Stripe.Event): Promise<ProcessResult> {
  const existing = await prisma.webhookEvent.findUnique({ where: { eventId: event.id } });
  if (existing?.processedAt) return { duplicate: true };

  if (!existing) {
    try {
      await prisma.webhookEvent.create({ data: { eventId: event.id, type: event.type } });
    } catch (error) {
      // Deux livraisons simultanees du meme evenement : l'autre le traite.
      if ((error as { code?: string }).code === 'P2002') return { duplicate: true };
      throw error;
    }
  }

  await handleEvent(event);
  await prisma.webhookEvent.update({
    where: { eventId: event.id },
    data: { processedAt: new Date() },
  });
  return { duplicate: false };
}
