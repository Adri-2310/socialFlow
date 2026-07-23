'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import type { BillingPeriod, Plan, PlanId } from '@/lib/plans';
import { PlanSelect } from '@/components/auth/plan-select';
import { RegisterForm } from '@/components/auth/register-form';

export function RegisterFlow({
  plans,
  initialPlanId,
}: {
  plans: Plan[];
  initialPlanId: PlanId | null;
}) {
  const [planId, setPlanId] = useState<PlanId | null>(initialPlanId);
  const [billing, setBilling] = useState<BillingPeriod>('monthly');
  const plan = planId ? (plans.find((p) => p.id === planId) ?? null) : null;

  function handleSelect(id: PlanId, selectedBilling: BillingPeriod) {
    setPlanId(id);
    setBilling(selectedBilling);
  }

  return (
    <main className="flex w-full flex-col items-center justify-center px-4 py-10 sm:px-6 lg:w-1/2">
      <div className="flex w-full max-w-md items-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" /> Accueil
        </Link>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      <div className="mt-8 w-full max-w-md">
        {!plan ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Choisissez votre formule
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              30 jours d&apos;essai gratuit, sans carte bancaire.
            </p>
            <div className="mt-6">
              <PlanSelect plans={plans} onSelect={handleSelect} />
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setPlanId(null)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" /> Changer de formule
            </button>

            <div className="mt-4 flex items-center justify-between gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Créer un compte
              </h1>
              <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {plan.name} · {billing === 'monthly' ? 'Mensuel' : 'Annuel'}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Essai de 30 jours, sans carte bancaire.
            </p>

            <div className="mt-6">
              <RegisterForm planId={plan.id} billingPeriod={billing} />
            </div>
          </>
        )}
      </div>

      <p className="mt-8 text-xs text-muted-foreground">© 2026 SocialFlow — Tous droits réservés.</p>
    </main>
  );
}
