import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pricing } from '@/components/landing/pricing';
import type { Plan } from '@/lib/billing/plans';

// Compléments au test des tarifs : liens d'inscription par formule, badge, avantages, bascule.
vi.mock('framer-motion');

const plans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Pour démarrer.',
    monthlyPrice: 49,
    yearlyPrice: 39,
    highlighted: false,
    badge: null,
    features: ['Cinq entreprises', 'Support email'],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Pour grandir.',
    monthlyPrice: 129,
    yearlyPrice: 103,
    highlighted: true,
    badge: 'Le plus choisi',
    features: ['Cinquante entreprises'],
  },
];

describe('Pricing : formules', () => {
  it('chaque « Démarrer l’essai » mène à l’inscription avec sa formule', () => {
    render(<Pricing plans={plans} />);

    const liens = screen.getAllByRole('link', { name: "Démarrer l'essai" });
    expect(liens.map((lien) => lien.getAttribute('href'))).toEqual([
      '/register?plan=starter',
      '/register?plan=pro',
    ]);
  });

  it('affiche le badge seulement sur la formule mise en avant', () => {
    render(<Pricing plans={plans} />);

    expect(screen.getAllByText('Le plus choisi')).toHaveLength(1);
  });

  it('liste les avantages de chaque formule', () => {
    render(<Pricing plans={plans} />);

    for (const avantage of ['Cinq entreprises', 'Support email', 'Cinquante entreprises']) {
      expect(screen.getByText(avantage)).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'Pro' })).toBeInTheDocument();
    expect(screen.getByText('Pour grandir.')).toBeInTheDocument();
  });
});

describe('Pricing : bascule', () => {
  it('indique la période active avec aria-pressed', async () => {
    render(<Pricing plans={plans} />);
    expect(screen.getByRole('button', { name: 'Mensuel' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Annuel/ })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: /Annuel/ }));

    expect(screen.getByRole('button', { name: 'Mensuel' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Annuel/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('propose deux boutons Mensuel et Annuel', () => {
    render(<Pricing plans={plans} />);

    expect(screen.getByRole('button', { name: 'Mensuel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Annuel/ })).toHaveTextContent('−20%');
  });

  it('les prix mensuels affichent « €/mois », les annuels « €/an »', async () => {
    render(<Pricing plans={plans} />);
    expect(screen.getAllByText('€/mois', { exact: false }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /Annuel/ }));

    expect(screen.getAllByText('€/an', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryByText('€/mois', { exact: false })).not.toBeInTheDocument();
  });
});
