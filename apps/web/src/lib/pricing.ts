import { prisma } from '@/lib/prisma';
import type { Plan } from '@/lib/plans';

export async function getPricingPlans(): Promise<Plan[]> {
  const rows = await prisma.pricingPlan.findMany({
    where: { archivedAt: null },
    orderBy: { sortOrder: 'asc' },
  });

  return rows.map((row) => ({
    id: row.planId,
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
