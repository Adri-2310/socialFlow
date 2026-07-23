'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { FadeIn } from '@/components/motion/fade-in';
import type { Plan } from '@/lib/plans';

export function Pricing({ plans }: { plans: Plan[] }) {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-3 rounded-full border border-border/60 bg-card/60 p-1 shadow-sm backdrop-blur-sm">
          <button
            onClick={() => setBilling('monthly')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              billing === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            Mensuel
          </button>
          <button
            onClick={() => setBilling('yearly')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              billing === 'yearly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            Annuel <span className="text-secondary">−20%</span>
          </button>
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
              <h3 className="font-semibold text-foreground">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              {plan.custom ? (
                <p className="mt-6 text-4xl font-extrabold text-foreground">Sur devis</p>
              ) : (
                <p className="mt-6">
                  <span className="text-4xl font-extrabold text-foreground">
                    {billing === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice}
                  </span>
                  <span className="text-muted-foreground"> €/mois</span>
                </p>
              )}
              <Link
                href={plan.custom ? '#contact' : `/register?plan=${plan.id}`}
                className={`mt-6 block rounded-xl py-2.5 text-center text-sm font-semibold transition ${
                  plan.highlighted
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-90'
                    : 'border border-border text-foreground hover:bg-muted'
                }`}
              >
                {plan.custom ? 'Nous contacter' : "Démarrer l'essai"}
              </Link>
              <ul className="mt-6 space-y-3 text-sm text-foreground">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check className="h-5 w-5 shrink-0 text-secondary" />
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
