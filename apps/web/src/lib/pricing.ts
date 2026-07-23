import { prisma } from '@/lib/prisma';
import type { Plan, PlanId } from '@/lib/plans';

export async function getPricingPlans(): Promise<Plan[]> {
  const rows = await prisma.pricingPlan.findMany({ orderBy: { sortOrder: 'asc' } });

  return rows.map((row) => ({
    id: row.planId as PlanId,
    name: row.name,
    description: row.description,
    monthlyPrice: row.monthlyPrice,
    yearlyPrice: row.yearlyPrice,
    custom: row.custom,
    highlighted: row.highlighted,
    badge: row.badge,
    features: row.features,
  }));
}
