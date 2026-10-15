// Remet les Price Stripe annuels en phase avec la regle D58 : le prix annuel
// d'un plan est un montant MENSUEL equivalent, Stripe facture 12 fois ce
// montant une fois par an. Les Price deja crees avant D58 portent le montant
// mensuel tel quel (ex. 120 EUR par an au lieu de 1 440 EUR).
//
// Un Price Stripe est immuable : on cree le bon Price PUIS on desactive
// l'ancien (le plan n'est jamais sans prix). Les abonnements en cours restent
// sur l'ancien Price et ne sont pas modifies.
//
// Simulation par defaut ; ajouter --apply pour ecrire chez Stripe.
//   node scripts/resync-yearly-prices.mjs
//   node scripts/resync-yearly-prices.mjs --apply
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

import Stripe from 'stripe';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../generated/prisma/client.ts';

const apply = process.argv.includes('--apply');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const plans = await prisma.pricingPlan.findMany({
  where: { archivedAt: null, yearlyPrice: { not: null } },
  orderBy: { sortOrder: 'asc' },
});
const prices = await stripe.prices.list({ limit: 100, active: true });

const eur = (cents) => `${(cents / 100).toLocaleString('fr-BE')} EUR`;
let toFix = 0;

for (const plan of plans) {
  const wanted = Math.round(plan.yearlyPrice * 12 * 100);
  const current = prices.data.find(
    (p) => p.metadata.planId === plan.planId && p.metadata.billingPeriod === 'yearly',
  );

  if (!current) {
    console.log(`- ${plan.planId} : aucun prix annuel actif chez Stripe (rien a corriger ici)`);
    continue;
  }
  if (current.unit_amount === wanted) {
    console.log(`= ${plan.planId} : deja correct (${eur(wanted)} par an)`);
    continue;
  }

  toFix += 1;
  console.log(
    `! ${plan.planId} : ${eur(current.unit_amount)} par an -> ${eur(wanted)} par an ` +
      `(${plan.yearlyPrice} EUR par mois x 12)`,
  );

  if (apply) {
    const created = await stripe.prices.create({
      product: typeof current.product === 'string' ? current.product : current.product.id,
      currency: current.currency,
      unit_amount: wanted,
      recurring: { interval: 'year' },
      metadata: { planId: plan.planId, billingPeriod: 'yearly' },
    });
    await stripe.prices.update(current.id, { active: false });
    console.log(`  cree ${created.id}, ancien ${current.id} desactive`);
  }
}

console.log(
  apply
    ? `\nTermine : ${toFix} prix corrige(s).`
    : `\nSimulation : ${toFix} prix a corriger. Relancer avec --apply pour les ecrire.`,
);
await prisma.$disconnect();
