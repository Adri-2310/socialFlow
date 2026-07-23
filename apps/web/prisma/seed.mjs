import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../generated/prisma/client.ts';

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const plans = [
  {
    planId: 'starter',
    name: 'Starter',
    description: 'Pour les petits cabinets qui démarrent.',
    monthlyPrice: 49,
    yearlyPrice: 39,
    custom: false,
    highlighted: false,
    badge: null,
    features: [
      "Jusqu'à 5 entreprises clientes",
      '2 gestionnaires',
      'Fiches de paie illimitées',
      'Calendrier ONSS',
    ],
    sortOrder: 1,
  },
  {
    planId: 'pro',
    name: 'Pro',
    description: 'Pour les cabinets en croissance.',
    monthlyPrice: 129,
    yearlyPrice: 103,
    custom: false,
    highlighted: true,
    badge: 'Le plus choisi',
    features: [
      "Jusqu'à 50 entreprises clientes",
      'Gestionnaires illimités',
      'DIMONA & C4 automatisées',
      'Portails clients & salariés',
      'Branding personnalisé',
    ],
    sortOrder: 2,
  },
  {
    planId: 'enterprise',
    name: 'Enterprise',
    description: 'Pour les grands secrétariats sociaux.',
    monthlyPrice: null,
    yearlyPrice: null,
    custom: true,
    highlighted: false,
    badge: null,
    features: [
      'Entreprises illimitées',
      "SSO / OAuth d'entreprise",
      'SLA & support prioritaire',
      'Accompagnement dédié',
    ],
    sortOrder: 3,
  },
];

for (const plan of plans) {
  await prisma.pricingPlan.upsert({
    where: { planId: plan.planId },
    create: plan,
    update: plan,
  });
}

console.log(`Seed termine : ${plans.length} formules.`);
await prisma.$disconnect();
