import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

// "30 jours d'essai gratuit, sans carte bancaire" (voir (auth)/register) :
// Stripe autorise un essai sans moyen de paiement attache, il ne pourra
// simplement pas prelever automatiquement a la fin de l'essai - demander une
// carte a ce moment-la est hors scope ici.
const TRIAL_DAYS = 30;

// Provisionne un vrai Customer + Subscription Stripe en essai pour un
// Cabinet qui vient de choisir un plan (inscription directe ou finalisation
// apres une inscription OAuth, voir hooks.after dans lib/auth.ts). Idempotent
// : ne fait rien si le Cabinet a deja un stripeCustomerId, ou si le plan n'a
// pas de Price Stripe pour la periode demandee.
export async function provisionStripeTrial(
  cabinetId: string,
  planId: string,
  billingPeriod: 'monthly' | 'yearly',
): Promise<void> {
  const cabinet = await prisma.cabinet.findUnique({
    where: { id: cabinetId },
    select: { stripeCustomerId: true, name: true },
  });
  if (!cabinet || cabinet.stripeCustomerId) return;

  const prices = await stripe.prices.list({ limit: 100, active: true });
  const price = prices.data.find(
    (p) => p.metadata.planId === planId && p.metadata.billingPeriod === billingPeriod,
  );
  if (!price) return;

  const customer = await stripe.customers.create({ name: cabinet.name, metadata: { cabinetId } });
  await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    trial_period_days: TRIAL_DAYS,
    metadata: { cabinetId },
  });

  await prisma.cabinet.update({ where: { id: cabinetId }, data: { stripeCustomerId: customer.id } });
}
