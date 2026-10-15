import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { stripeUnitAmountCents } from '@/lib/billing';

// La base de donnees est la SEULE source du prix d'un plan (PricingPlan.
// monthlyPrice / yearlyPrice). Stripe ne fait qu'en porter une copie : un
// objet Price immuable, a recreer des que le montant change.
//
// Plutot que de faire confiance a un Price cree auparavant (qui peut avoir
// derive : plan modifie, ancienne regle de calcul...), ce module le recale sur
// la base juste avant d'en avoir besoin. Un client ne peut donc jamais payer
// un montant different de celui affiche (D58).

export type EnsurePriceError = 'PLAN_UNAVAILABLE' | 'PRICE_NOT_SET';

export type EnsurePriceResult =
  | { ok: true; priceId: string; created: boolean }
  | { ok: false; error: EnsurePriceError };

const INTERVAL = { monthly: 'month', yearly: 'year' } as const;

// Montant (EUR) facture pour un plan et une periode, tel que defini en base.
// Monthly : le prix mensuel. Yearly : 12 fois le prix mensuel equivalent.
export function expectedAmountCents(
  plan: { monthlyPrice: number | null; yearlyPrice: number | null },
  period: 'monthly' | 'yearly',
): number | null {
  const value = period === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  return value === null ? null : stripeUnitAmountCents(value, period);
}

export async function ensureStripePrice(
  planId: string,
  period: 'monthly' | 'yearly',
): Promise<EnsurePriceResult> {
  const plan = await prisma.pricingPlan.findUnique({
    where: { planId },
    select: {
      name: true,
      monthlyPrice: true,
      yearlyPrice: true,
      archivedAt: true,
    },
  });
  // Un plan retire du catalogue ne se souscrit plus en ligne.
  if (!plan || plan.archivedAt) return { ok: false, error: 'PLAN_UNAVAILABLE' };

  const expected = expectedAmountCents(plan, period);
  if (expected === null) return { ok: false, error: 'PRICE_NOT_SET' };

  const prices = await stripe.prices.list({ limit: 100, active: true });
  const current = prices.data.find(
    (p) => p.metadata.planId === planId && p.metadata.billingPeriod === period,
  );

  if (
    current &&
    current.unit_amount === expected &&
    current.recurring?.interval === INTERVAL[period]
  ) {
    return { ok: true, priceId: current.id, created: false };
  }

  // Produit du plan : cree s'il n'existe pas encore chez Stripe.
  const products = await stripe.products.list({ limit: 100, active: true });
  const product =
    products.data.find((p) => p.metadata.planId === planId) ??
    (await stripe.products.create({ name: plan.name, metadata: { planId } }));

  // Le nouveau Price d'abord, l'ancien ensuite : le plan n'est jamais sans
  // prix. Les abonnements en cours restent sur leur ancien Price.
  const created = await stripe.prices.create({
    product: product.id,
    currency: 'eur',
    unit_amount: expected,
    recurring: { interval: INTERVAL[period] },
    metadata: { planId, billingPeriod: period },
  });
  if (current) {
    await stripe.prices.update(current.id, { active: false });
  }

  return { ok: true, priceId: created.id, created: true };
}
