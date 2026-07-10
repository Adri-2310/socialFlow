'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';

export function Pricing() {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');

  const plans = [
    {
      name: 'Starter',
      description: 'Pour les petits cabinets qui démarrent.',
      monthlyPrice: 49,
      yearlyPrice: 39,
      highlighted: false,
      features: [
        'Jusqu\'à 5 entreprises clientes',
        '2 gestionnaires',
        'Fiches de paie illimitées',
        'Calendrier ONSS',
      ],
    },
    {
      name: 'Pro',
      description: 'Pour les cabinets en croissance.',
      monthlyPrice: 129,
      yearlyPrice: 103,
      highlighted: true,
      badge: 'Le plus choisi',
      features: [
        'Jusqu\'à 50 entreprises clientes',
        'Gestionnaires illimités',
        'DIMONA & C4 automatisées',
        'Portails clients & salariés',
        'Branding personnalisé',
      ],
    },
    {
      name: 'Enterprise',
      description: 'Pour les grands secrétariats sociaux.',
      monthlyPrice: null,
      yearlyPrice: null,
      highlighted: false,
      custom: true,
      features: [
        'Entreprises illimitées',
        'SSO / OAuth d\'entreprise',
        'SLA & support prioritaire',
        'Accompagnement dédié',
      ],
    },
  ];

  return (
    <section id="pricing" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-sm font-semibold uppercase tracking-wider text-primary">
          Tarifs
        </span>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Un prix simple, par cabinet
        </h2>

        <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-border bg-card p-1">
          <button
            onClick={() => setBilling('monthly')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              billing === 'monthly'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground'
            }`}
          >
            Mensuel
          </button>
          <button
            onClick={() => setBilling('yearly')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              billing === 'yearly'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground'
            }`}
          >
            Annuel <span className="text-secondary">−20%</span>
          </button>
        </div>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-2xl border bg-card p-8 ${
              plan.highlighted
                ? 'border-2 border-primary shadow-xl'
                : 'border-border'
            }`}
          >
            {plan.highlighted && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                {plan.badge}
              </span>
            )}
            <h3 className="font-semibold text-foreground">{plan.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {plan.description}
            </p>
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
              href={plan.custom ? '#contact' : '/register'}
              className={`mt-6 block rounded-xl py-2.5 text-center text-sm font-semibold ${
                plan.highlighted
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'border border-border text-foreground hover:bg-muted'
              }`}
            >
              {plan.custom ? 'Nous contacter' : 'Démarrer l\'essai'}
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
        ))}
      </div>
    </section>
  );
}
