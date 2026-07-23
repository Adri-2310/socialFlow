'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { PLANS, type PlanId } from '@/lib/plans';

export function PlanSelect({ onSelect }: { onSelect: (id: PlanId) => void }) {
  return (
    <div>
      <div className="space-y-4">
        {PLANS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => onSelect(plan.id)}
            className={`relative flex w-full items-start justify-between gap-4 rounded-2xl p-5 text-left transition ${
              plan.highlighted
                ? 'border-2 border-primary/60 bg-gradient-to-b from-primary/10 via-card to-card shadow-lg shadow-primary/10'
                : 'border border-border/60 bg-card/60 hover:-translate-y-0.5 hover:shadow-md'
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
                    <Check className="h-3.5 w-3.5 shrink-0 text-secondary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-extrabold text-foreground">
                {plan.monthlyPrice}
                <span className="text-xs font-medium text-muted-foreground">€/mois</span>
              </p>
            </div>
          </button>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Besoin de plus ?{' '}
        <Link href="/contact" className="font-semibold text-primary hover:underline">
          Contactez-nous
        </Link>{' '}
        pour une offre Enterprise sur mesure.
      </p>
    </div>
  );
}
