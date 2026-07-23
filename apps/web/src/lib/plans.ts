export type PlanId = 'starter' | 'pro' | 'enterprise';
export type BillingPeriod = 'monthly' | 'yearly';

export type Plan = {
  id: PlanId;
  name: string;
  description: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  custom: boolean;
  highlighted: boolean;
  badge: string | null;
  features: string[];
};

export function isPlanId(value: string | null | undefined): value is PlanId {
  return value === 'starter' || value === 'pro' || value === 'enterprise';
}
