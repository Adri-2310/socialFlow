'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import type { BillingPeriod, Plan, PlanId } from '@/lib/billing/plans';
import { planPriceDisplay } from '@/lib/billing/plan-price-display';
import { Button } from '@/components/ui/button';

// Bascule Mensuel/Annuel : deux boutons dont `aria-pressed` dit lequel est actif.
function PeriodButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'ghost'}
      size="xs"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-3 font-semibold ${active ? '' : 'text-muted-foreground'}`}
    >
      {children}
    </Button>
  );
}

export function PlanSelect({
  plans,
  onSelect,
}: {
  plans: Plan[];
  onSelect: (id: PlanId, billing: BillingPeriod) => void;
}) {
  const [billing, setBilling] = useState<BillingPeriod>('monthly');

  return (
    <div>
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 p-1 shadow-sm backdrop-blur-sm">
          <PeriodButton active={billing === 'monthly'} onClick={() => setBilling('monthly')}>
            Mensuel
          </PeriodButton>
          <PeriodButton active={billing === 'yearly'} onClick={() => setBilling('yearly')}>
            {/* D62 : le teal `secondary` n'est pas lisible en texte ; l'émeraude l'est, sauf sur l'aplat actif. */}
            Annuel{' '}
            <span className={billing === 'yearly' ? '' : 'text-emerald-800 dark:text-emerald-300'}>−20%</span>
          </PeriodButton>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {plans.map((plan) => (
          // Une carte est un bouton : choisir une formule fait passer à l'étape suivante.
          <Button
            key={plan.id}
            type="button"
            variant="outline"
            onClick={() => onSelect(plan.id, billing)}
            className={`relative h-auto w-full items-start justify-between gap-4 whitespace-normal rounded-2xl p-5 text-left font-normal ${
              plan.highlighted
                ? 'border-2 border-primary/60 bg-gradient-to-b from-primary/10 via-card to-card shadow-lg shadow-primary/10'
                : 'border-border/60 bg-card/60 hover:-translate-y-0.5 hover:bg-card/60 hover:shadow-md dark:bg-card/60 dark:hover:bg-card/60'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{plan.name}</span>
                {plan.badge && (
                  <span className="rounded-full bg-gradient-to-r from-primary to-secondary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    {plan.badge}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
              <ul className="mt-3 space-y-1.5">
                {plan.features.slice(0, 2).map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-extrabold text-foreground">
                {planPriceDisplay(plan, billing).amount}
                <span className="text-xs font-medium text-muted-foreground">
                  {planPriceDisplay(plan, billing).unit}
                </span>
              </p>
              {planPriceDisplay(plan, billing).note && (
                <p className="text-xs text-muted-foreground">
                  {planPriceDisplay(plan, billing).note}
                </p>
              )}
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
