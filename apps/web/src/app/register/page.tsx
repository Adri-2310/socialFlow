import type { Metadata } from 'next';
import { AuthBrandPanel } from '@/components/auth/auth-brand-panel';
import { RegisterFlow } from '@/components/auth/register-flow';
import { isPlanId, type PlanId } from '@/lib/plans';
import { getPricingPlans } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Créer un compte — SocialFlow',
  description:
    "Choisissez votre formule et créez votre compte SocialFlow pour démarrer l'essai de 30 jours.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const [{ plan }, allPlans] = await Promise.all([searchParams, getPricingPlans()]);
  const trialPlans = allPlans.filter((p) => !p.custom);

  const initialPlanId: PlanId | null =
    isPlanId(plan) && trialPlans.some((p) => p.id === plan) ? plan : null;

  return (
    <div className="flex min-h-screen">
      <AuthBrandPanel
        title={
          <>
            Simplifiez la paie
            <br />
            de vos clients.
          </>
        }
        description="Rejoignez les cabinets qui automatisent leurs fiches de paie, leurs échéances ONSS et leurs déclarations DIMONA."
        quote="« Nous avons divisé par deux le temps de traitement de nos paies. » — Payroll BXL"
      />

      <RegisterFlow plans={trialPlans} initialPlanId={initialPlanId} />
    </div>
  );
}
