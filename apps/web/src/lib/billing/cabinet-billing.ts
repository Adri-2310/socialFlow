import { prisma } from '@/lib/prisma';
import {
  graceEndsAt,
  normalizeBillingPeriod,
  normalizeBillingStatus,
  type BillingStatus,
} from '@/lib/billing/billing';
import { expectedAmountCents } from '@/lib/billing/stripe-prices';

// Lecture de l'abonnement d'un cabinet pour sa page "Facturation"
// (roles/02-cabinet-rh.md § 4.5). Comme le reste de la couche de lecture du
// Cabinet RH, le cabinetId vient de la session, jamais de l'URL.

export type CabinetSubscriptionDetails = {
  planName: string | null;
  planDescription: string | null;
  features: string[];
  billingPeriod: 'monthly' | 'yearly' | null;
  status: BillingStatus;
  trialEndsAt: Date | null;
  // Fin de la periode en cours : prochain paiement en ACTIF.
  currentPeriodEnd: Date | null;
  // D59 : resiliation programmee en fin de periode (l'acces dure jusque-la).
  cancelAtPeriodEnd: boolean;
  // Fin du delai de grace (D57), connue seulement apres un paiement echoue.
  graceEndsAt: Date | null;
  // Montant facture a chaque echeance, en centimes (D58) : le prix mensuel
  // en mensuel, 12 fois le prix mensuel equivalent en annuel. null = plan ou
  // periode inconnus. C'est le prix actuel du plan : un abonnement ancien
  // peut encore etre facture a son ancien Price jusqu'a son renouvellement.
  amountCents: number | null;
  // Montant mensuel equivalent, donne a titre d'information en annuel.
  monthlyEquivalentCents: number | null;
};

export async function getCabinetSubscriptionDetails(
  cabinetId: string,
): Promise<CabinetSubscriptionDetails> {
  const cabinet = await prisma.cabinet.findUniqueOrThrow({
    where: { id: cabinetId },
    select: {
      planId: true,
      billingPeriod: true,
      billingStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      pastDueSince: true,
      cancelAtPeriodEnd: true,
    },
  });

  const plan = cabinet.planId
    ? await prisma.pricingPlan.findUnique({
        where: { planId: cabinet.planId },
        select: {
          name: true,
          description: true,
          features: true,
          monthlyPrice: true,
          yearlyPrice: true,
        },
      })
    : null;

  const billingPeriod = normalizeBillingPeriod(cabinet.billingPeriod);
  const status = normalizeBillingStatus(cabinet.billingStatus);
  const amountCents = plan && billingPeriod ? expectedAmountCents(plan, billingPeriod) : null;

  return {
    planName: plan?.name ?? cabinet.planId ?? null,
    planDescription: plan?.description ?? null,
    features: plan?.features ?? [],
    billingPeriod,
    status,
    trialEndsAt: cabinet.trialEndsAt,
    currentPeriodEnd: cabinet.currentPeriodEnd,
    cancelAtPeriodEnd: cabinet.cancelAtPeriodEnd,
    graceEndsAt:
      status === 'DELAI_GRACE' && cabinet.pastDueSince ? graceEndsAt(cabinet.pastDueSince) : null,
    amountCents,
    monthlyEquivalentCents:
      amountCents !== null && billingPeriod === 'yearly' ? Math.round(amountCents / 12) : null,
  };
}
