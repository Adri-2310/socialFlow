// PlanId n'est plus restreint a un enum fige : les plans sont geres depuis
// /dashboard/admin/configuration et peuvent etre crees/archives dynamique-
// ment (voir PricingPlan dans prisma/schema.prisma). La vraie validation
// (le plan existe, n'est pas archive, n'est pas "sur devis") se fait cote
// serveur : dans (auth)/register/page.tsx (filtre sur les plans reellement
// disponibles) et dans lib/auth.ts (hooks.after sur /sign-up/email et
// /update-user, les seuls chemins qui ecrivent ce champ).
export type PlanId = string;
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

// Verification de forme uniquement (non vide) : ce module n'a pas acces a la
// base pour verifier qu'un plan existe reellement.
export function isPlanId(value: string | null | undefined): value is PlanId {
  return typeof value === 'string' && value.length > 0;
}
