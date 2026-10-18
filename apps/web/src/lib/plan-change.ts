import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { normalizeBillingPeriod, normalizeBillingStatus } from '@/lib/billing';
import {
  getCabinetQuotaUsage,
  type CabinetQuotaUsage,
  type PlanQuotas,
  type QuotaKey,
} from '@/lib/cabinet-quotas';
import { ensureStripePrice, expectedAmountCents } from '@/lib/stripe-prices';

// Changement de plan ou de periodicite (D60). Tout prend effet a la FIN de la
// periode en cours : le cabinet garde ce qu'il a paye jusqu'au terme, sans
// prorata ni remboursement. Cote Stripe, le changement est un "subscription
// schedule" : l'abonnement garde ses lignes actuelles jusqu'a l'echeance, puis
// passe au nouveau Price. Le plan local suit ensuite Stripe par webhook (D57),
// jamais l'inverse.
//
// Le cabinet vient toujours de la session ; le plan vise est valide ici
// (existe, non archive, prix defini, quotas respectes).

export type PlanChangeError =
  | 'CABINET_NOT_FOUND'
  | 'NO_STRIPE_CUSTOMER'
  | 'NO_SUBSCRIPTION'
  | 'PLAN_CHANGE_NOT_ALLOWED'
  | 'RESUME_FIRST'
  | 'PLAN_UNAVAILABLE'
  | 'PRICE_NOT_SET'
  | 'SAME_PLAN'
  | 'QUOTA_EXCEEDED'
  | 'NO_PENDING_CHANGE'
  | 'STRIPE_FAILED';

type Period = 'monthly' | 'yearly';

export type QuotaBlocker = { quota: QuotaKey; used: number; limit: number };

// Un changement n'est possible que pour un abonnement en cours (essai ou
// actif). En retard de paiement, impaye ou resilie : on regularise d'abord.
const CHANGE_ALLOWED_STATUSES = ['ESSAI', 'ACTIF'];

const LIVE_STATUSES = ['trialing', 'active'];

// Regle pure (CONVENTIONS, roles/02 § 4.5) : un changement est refuse quand la
// consommation actuelle DEPASSE les quotas du plan vise. Etre exactement a la
// limite reste permis (on ne peut juste plus rien ajouter). null = illimite.
export function quotaBlockers(usage: CabinetQuotaUsage, target: PlanQuotas): QuotaBlocker[] {
  const checks: [QuotaKey, number][] = [
    ['maxUtilisateurs', usage.utilisateurs.used],
    ['maxEntreprises', usage.entreprises.used],
    ['maxStorageMb', usage.storageMb.used],
  ];

  return checks.flatMap(([quota, used]) => {
    const limit = target[quota];
    return limit !== null && used > limit ? [{ quota, used, limit }] : [];
  });
}

// --- Options proposees au cabinet ------------------------------------------

export type PlanOption = {
  planId: string;
  name: string;
  description: string;
  features: string[];
  isCurrentPlan: boolean;
  monthlyCents: number | null;
  // Total facture par an : 12 fois le mensuel equivalent (D58).
  yearlyCents: number | null;
  // Quotas qui interdisent de choisir ce plan, avec ce qu'il faudrait reduire.
  blockers: QuotaBlocker[];
};

export type PlanChangeOptions = {
  currentPlanId: string | null;
  currentPeriod: Period | null;
  // false : pas de changement possible maintenant, raison dans `reason`.
  canChange: boolean;
  reason: 'STATE' | 'CANCELLING' | null;
  plans: PlanOption[];
};

export async function getPlanChangeOptions(cabinetId: string): Promise<PlanChangeOptions> {
  const cabinet = await prisma.cabinet.findUniqueOrThrow({
    where: { id: cabinetId },
    select: { planId: true, billingPeriod: true, billingStatus: true, cancelAtPeriodEnd: true },
  });
  const status = normalizeBillingStatus(cabinet.billingStatus);

  const [plans, usage] = await Promise.all([
    prisma.pricingPlan.findMany({
      where: { archivedAt: null },
      orderBy: { sortOrder: 'asc' },
    }),
    getCabinetQuotaUsage(cabinetId),
  ]);

  let reason: PlanChangeOptions['reason'] = null;
  if (!CHANGE_ALLOWED_STATUSES.includes(status)) reason = 'STATE';
  else if (cabinet.cancelAtPeriodEnd) reason = 'CANCELLING';

  return {
    currentPlanId: cabinet.planId,
    currentPeriod: normalizeBillingPeriod(cabinet.billingPeriod),
    canChange: reason === null,
    reason,
    plans: plans.map((plan) => ({
      planId: plan.planId,
      name: plan.name,
      description: plan.description,
      features: plan.features,
      isCurrentPlan: plan.planId === cabinet.planId,
      monthlyCents: expectedAmountCents(plan, 'monthly'),
      yearlyCents: expectedAmountCents(plan, 'yearly'),
      blockers: quotaBlockers(usage, plan),
    })),
  };
}

// --- Changement programme --------------------------------------------------

export type PendingPlanChange = {
  planId: string | null;
  planName: string | null;
  billingPeriod: Period | null;
  effectiveAt: Date | null;
  amountCents: number | null;
};

async function liveSubscription(customerId: string): Promise<Stripe.Subscription | null> {
  const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
  return list.data.find((s) => LIVE_STATUSES.includes(s.status)) ?? null;
}

const scheduleIdOf = (subscription: Stripe.Subscription): string | null => {
  const schedule = subscription.schedule;
  return typeof schedule === 'string' ? schedule : (schedule?.id ?? null);
};

// Changement deja programme, lu en direct dans Stripe : la phase suivante du
// "schedule" de l'abonnement. null s'il n'y en a pas.
export async function getPendingPlanChange(
  customerId: string,
): Promise<PendingPlanChange | null> {
  const subscription = await liveSubscription(customerId);
  const scheduleId = subscription ? scheduleIdOf(subscription) : null;
  if (!scheduleId) return null;

  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId, {
    expand: ['phases.items.price'],
  });
  if (schedule.status !== 'active' && schedule.status !== 'not_started') return null;

  const next = schedule.phases[1];
  const price = next?.items[0]?.price;
  if (!next || !price || typeof price === 'string' || 'deleted' in price) return null;

  const planId = price.metadata?.planId ?? null;
  const plan = planId
    ? await prisma.pricingPlan.findUnique({ where: { planId }, select: { name: true } })
    : null;

  return {
    planId,
    planName: plan?.name ?? planId,
    billingPeriod: normalizeBillingPeriod(price.metadata?.billingPeriod),
    effectiveAt: new Date(next.start_date * 1000),
    amountCents: price.unit_amount,
  };
}

export type ScheduleResult =
  | { ok: true; effectiveAt: Date }
  | { ok: false; error: PlanChangeError; blockers?: QuotaBlocker[] };

export async function schedulePlanChange(
  cabinetId: string,
  actorId: string,
  target: { planId: string; billingPeriod: Period },
): Promise<ScheduleResult> {
  const cabinet = await prisma.cabinet.findFirst({
    where: { id: cabinetId, deletedAt: null },
    select: {
      stripeCustomerId: true,
      planId: true,
      billingPeriod: true,
      billingStatus: true,
      cancelAtPeriodEnd: true,
    },
  });
  if (!cabinet) return { ok: false, error: 'CABINET_NOT_FOUND' };
  if (!cabinet.stripeCustomerId) return { ok: false, error: 'NO_STRIPE_CUSTOMER' };

  if (!CHANGE_ALLOWED_STATUSES.includes(normalizeBillingStatus(cabinet.billingStatus))) {
    return { ok: false, error: 'PLAN_CHANGE_NOT_ALLOWED' };
  }
  // Une resiliation programmee et un changement de plan se contredisent.
  if (cabinet.cancelAtPeriodEnd) return { ok: false, error: 'RESUME_FIRST' };

  if (target.planId === cabinet.planId && target.billingPeriod === cabinet.billingPeriod) {
    return { ok: false, error: 'SAME_PLAN' };
  }

  const plan = await prisma.pricingPlan.findUnique({
    where: { planId: target.planId },
    select: { archivedAt: true, maxEntreprises: true, maxUtilisateurs: true, maxStorageMb: true },
  });
  if (!plan || plan.archivedAt) return { ok: false, error: 'PLAN_UNAVAILABLE' };

  // Quotas du plan vise : le message indique quoi reduire (D15).
  const blockers = quotaBlockers(await getCabinetQuotaUsage(cabinetId), plan);
  if (blockers.length > 0) return { ok: false, error: 'QUOTA_EXCEEDED', blockers };

  try {
    // Le Price vient de la base (D58) : le client ne peut payer qu'un montant
    // affiche.
    const price = await ensureStripePrice(target.planId, target.billingPeriod);
    if (!price.ok) {
      return {
        ok: false,
        error: price.error === 'PRICE_NOT_SET' ? 'PRICE_NOT_SET' : 'PLAN_UNAVAILABLE',
      };
    }

    const subscription = await liveSubscription(cabinet.stripeCustomerId);
    if (!subscription) return { ok: false, error: 'NO_SUBSCRIPTION' };
    const currentPriceId = subscription.items.data[0]?.price.id;
    if (!currentPriceId) return { ok: false, error: 'NO_SUBSCRIPTION' };

    // Reutilise le "schedule" existant (un nouveau choix remplace le
    // precedent) ou en cree un a partir de l'abonnement.
    const existingId = scheduleIdOf(subscription);
    const schedule = existingId
      ? await stripe.subscriptionSchedules.retrieve(existingId)
      : await stripe.subscriptionSchedules.create({ from_subscription: subscription.id });

    const current = schedule.phases[0];
    if (!current) return { ok: false, error: 'NO_SUBSCRIPTION' };

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'release',
      proration_behavior: 'none',
      phases: [
        {
          items: [{ price: currentPriceId, quantity: 1 }],
          start_date: current.start_date,
          end_date: current.end_date,
          ...(current.trial_end ? { trial_end: current.trial_end } : {}),
        },
        { items: [{ price: price.priceId, quantity: 1 }] },
      ],
    });

    const effectiveAt = new Date(current.end_date * 1000);

    // D75 : le plan vise est memorise pour reserver ses quotas des maintenant
    // (rien a reserver si seul la periodicite change).
    await prisma.$transaction([
      prisma.cabinet.update({
        where: { id: cabinetId },
        data: { pendingPlanId: target.planId !== cabinet.planId ? target.planId : null },
      }),
      prisma.auditLog.create({
        data: {
          action: 'PLAN_CHANGE_SCHEDULED',
          cabinetId,
          actorId,
          metadata: {
            from: { planId: cabinet.planId, billingPeriod: cabinet.billingPeriod },
            to: target,
            effectiveAt: effectiveAt.toISOString(),
          },
        },
      }),
    ]);

    return { ok: true, effectiveAt };
  } catch (error) {
    // Jamais de detail Stripe dans la reponse : seulement dans les logs.
    console.error('Echec de la programmation du changement de plan', error);
    return { ok: false, error: 'STRIPE_FAILED' };
  }
}

export async function cancelPlanChange(
  cabinetId: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: PlanChangeError }> {
  const cabinet = await prisma.cabinet.findFirst({
    where: { id: cabinetId, deletedAt: null },
    select: { stripeCustomerId: true },
  });
  if (!cabinet) return { ok: false, error: 'CABINET_NOT_FOUND' };
  if (!cabinet.stripeCustomerId) return { ok: false, error: 'NO_STRIPE_CUSTOMER' };

  try {
    const subscription = await liveSubscription(cabinet.stripeCustomerId);
    const scheduleId = subscription ? scheduleIdOf(subscription) : null;
    if (!subscription || !scheduleId) return { ok: false, error: 'NO_PENDING_CHANGE' };

    // "Release" : l'abonnement continue tel quel, sans le changement.
    await stripe.subscriptionSchedules.release(scheduleId);

    // D75 : les quotas du plan vise ne sont plus reserves.
    await prisma.$transaction([
      prisma.cabinet.update({ where: { id: cabinetId }, data: { pendingPlanId: null } }),
      prisma.auditLog.create({
        data: { action: 'PLAN_CHANGE_CANCELLED', cabinetId, actorId },
      }),
    ]);
    return { ok: true };
  } catch (error) {
    console.error("Echec de l'annulation du changement de plan", error);
    return { ok: false, error: 'STRIPE_FAILED' };
  }
}
