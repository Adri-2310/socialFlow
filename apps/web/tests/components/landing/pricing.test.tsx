import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pricing } from '@/components/landing/pricing';
import type { Plan } from '@/lib/billing/plans';

vi.mock('framer-motion');

const mockPlans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Pour les petits cabinets qui démarrent.',
    monthlyPrice: 49,
    yearlyPrice: 39,
    highlighted: false,
    badge: null,
    features: ["Jusqu'à 5 entreprises clientes"],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Pour les cabinets en croissance.',
    monthlyPrice: 129,
    yearlyPrice: 103,
    highlighted: true,
    badge: 'Le plus choisi',
    features: ["Jusqu'à 50 entreprises clientes"],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Pour les grands secrétariats sociaux.',
    monthlyPrice: 750,
    yearlyPrice: 600,
    highlighted: false,
    badge: null,
    features: ['Entreprises illimitées'],
  },
];

describe('Pricing', () => {
  it('affiche les prix mensuels par défaut', () => {
    render(<Pricing plans={mockPlans} />);

    expect(screen.getByText('49')).toBeInTheDocument();
    expect(screen.getByText('129')).toBeInTheDocument();
  });

  it('affiche les prix annuels après avoir cliqué sur "Annuel"', () => {
    render(<Pricing plans={mockPlans} />);

    fireEvent.click(screen.getByText(/Annuel/));

    // D58 : en annuel on affiche le total de l'annee (12 x le prix mensuel
    // equivalent), le cout mensuel n'etant qu'une information.
    expect(screen.getByText('468')).toBeInTheDocument();
    expect(screen.getByText('1236')).toBeInTheDocument();
    expect(screen.getAllByText('€/an').length).toBeGreaterThan(0);
    expect(screen.getByText('soit 39 € par mois, facturé une fois par an')).toBeInTheDocument();
    expect(screen.queryByText('49')).not.toBeInTheDocument();
    expect(screen.queryByText('39')).not.toBeInTheDocument();
  });

  it('revient aux prix mensuels après un second clic sur "Mensuel"', () => {
    render(<Pricing plans={mockPlans} />);

    fireEvent.click(screen.getByText(/Annuel/));
    fireEvent.click(screen.getByText('Mensuel'));

    expect(screen.getByText('49')).toBeInTheDocument();
  });

  it('affiche un prix pour chacun des 3 plans, sans devis', () => {
    render(<Pricing plans={mockPlans} />);

    expect(screen.queryByText('Sur devis')).not.toBeInTheDocument();
    expect(screen.queryByText('Nous contacter')).not.toBeInTheDocument();
    expect(screen.getByText('750')).toBeInTheDocument();
    expect(screen.getAllByText("Démarrer l'essai")).toHaveLength(3);
  });
});
