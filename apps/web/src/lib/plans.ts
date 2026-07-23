export type PlanId = 'starter' | 'pro';

export type Plan = {
  id: PlanId;
  name: string;
  description: string;
  monthlyPrice: number;
  features: string[];
  highlighted?: boolean;
  badge?: string;
};

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Pour les petits cabinets qui démarrent.',
    monthlyPrice: 49,
    features: [
      "Jusqu'à 5 entreprises clientes",
      '2 gestionnaires',
      'Fiches de paie illimitées',
      'Calendrier ONSS',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Pour les cabinets en croissance.',
    monthlyPrice: 129,
    highlighted: true,
    badge: 'Le plus choisi',
    features: [
      "Jusqu'à 50 entreprises clientes",
      'Gestionnaires illimités',
      'DIMONA & C4 automatisées',
      'Portails clients & salariés',
      'Branding personnalisé',
    ],
  },
];

export function isPlanId(value: string | null | undefined): value is PlanId {
  return PLANS.some((plan) => plan.id === value);
}

export function getPlan(id: PlanId): Plan {
  return PLANS.find((plan) => plan.id === id)!;
}
