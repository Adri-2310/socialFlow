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
    // Prix et quotas alignes sur le PRD client (doc/analysis/PRD_CLIENT.md,
    // section "Modele de Revenus") - prix annuel = -20% arrondi, coherent
    // avec le badge "Annuel -20%" affiche dans l'UI.
    monthlyPrice: 150,
    yearlyPrice: 120,
    custom: false,
    highlighted: false,
    badge: null,
    features: [
      "Jusqu'à 25 entreprises clientes",
      '3 gestionnaires',
      '5 Go de stockage',
      'Fiches de paie illimitées',
      'Calendrier ONSS',
    ],
    sortOrder: 1,
  },
  {
    planId: 'pro',
    name: 'Pro',
    description: 'Pour les cabinets en croissance.',
    monthlyPrice: 300,
    yearlyPrice: 240,
    custom: false,
    highlighted: true,
    badge: 'Le plus choisi',
    features: [
      "Jusqu'à 100 entreprises clientes",
      '10 gestionnaires',
      '25 Go de stockage',
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
    monthlyPrice: 750,
    yearlyPrice: 600,
    custom: false,
    highlighted: false,
    badge: null,
    features: [
      'Entreprises clientes illimitées',
      'Gestionnaires illimités',
      '100 Go de stockage',
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
