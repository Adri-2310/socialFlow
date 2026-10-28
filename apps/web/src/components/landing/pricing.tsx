'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { FadeIn } from '@/components/motion/fade-in';
import type { Plan } from '@/lib/billing/plans';
import { planPriceDisplay } from '@/lib/billing/plan-price-display';
import { Button, buttonVariants } from '@/components/ui/button';

export function Pricing({ plans }: { plans: Plan[] }) {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-3 rounded-full border border-border/60 bg-card/60 p-1 shadow-sm backdrop-blur-sm">
          {/* `aria-pressed` dit quelle période est active. */}
          <Button
            type="button"
            variant={billing === 'monthly' ? 'default' : 'ghost'}
            size="sm"
            aria-pressed={billing === 'monthly'}
            onClick={() => setBilling('monthly')}
            className={`rounded-full px-4 ${billing === 'monthly' ? '' : 'text-muted-foreground'}`}
          >
            Mensuel
          </Button>
          <Button
            type="button"
            variant={billing === 'yearly' ? 'default' : 'ghost'}
            size="sm"
            aria-pressed={billing === 'yearly'}
            onClick={() => setBilling('yearly')}
            className={`rounded-full px-4 ${billing === 'yearly' ? '' : 'text-muted-foreground'}`}
          >
            {/* D62 : le teal `secondary` n'est pas lisible en texte ; l'émeraude l'est, sauf sur l'aplat actif. */}
            Annuel{' '}
            <span className={billing === 'yearly' ? '' : 'text-emerald-800 dark:text-emerald-300'}>−20%</span>
          </Button>
        </div>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {plans.map((plan, i) => (
          <FadeIn key={plan.id} delay={i * 0.1} className="h-full">
            <div
              className={`relative h-full rounded-2xl p-8 backdrop-blur-sm transition ${
                plan.highlighted
                  ? 'border-2 border-primary/60 bg-gradient-to-b from-primary/10 via-card to-card shadow-2xl shadow-primary/20 lg:-translate-y-3'
                  : 'border border-border/60 bg-card/60 shadow-sm hover:-translate-y-1 hover:shadow-lg'
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-secondary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-md">
                  {plan.badge}
                </span>
              )}
              <h2 className="font-semibold text-foreground">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              <p className="mt-6">
                <span className="text-4xl font-extrabold text-foreground">
                  {planPriceDisplay(plan, billing).amount}
                </span>
                <span className="text-muted-foreground">
                  {' '}
                  {planPriceDisplay(plan, billing).unit}
                </span>
                {planPriceDisplay(plan, billing).note && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {planPriceDisplay(plan, billing).note}
                  </span>
                )}
              </p>
              <Link
                href={`/register?plan=${plan.id}`}
                className={buttonVariants({
                  variant: plan.highlighted ? 'default' : 'outline',
                  size: 'lg',
                  className: `mt-6 w-full rounded-xl ${
                    plan.highlighted ? 'shadow-lg shadow-primary/30 hover:opacity-90' : ''
                  }`,
                })}
              >
                Démarrer l&apos;essai
              </Link>
              <ul className="mt-6 space-y-3 text-sm text-foreground">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}
