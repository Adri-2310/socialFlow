import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pricing } from '@/components/landing/pricing';
import type { Plan } from '@/lib/plans';

vi.mock('framer-motion');

const mockPlans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Pour les petits cabinets qui démarrent.',
    monthlyPrice: 49,
    yearlyPrice: 39,
    custom: false,
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
    custom: false,
    highlighted: true,
    badge: 'Le plus choisi',
    features: ["Jusqu'à 50 entreprises clientes"],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Pour les grands secrétariats sociaux.',
    monthlyPrice: null,
    yearlyPrice: null,
    custom: true,
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

    expect(screen.getByText('39')).toBeInTheDocument();
    expect(screen.getByText('103')).toBeInTheDocument();
    expect(screen.queryByText('49')).not.toBeInTheDocument();
  });

  it('revient aux prix mensuels après un second clic sur "Mensuel"', () => {
    render(<Pricing plans={mockPlans} />);

    fireEvent.click(screen.getByText(/Annuel/));
    fireEvent.click(screen.getByText('Mensuel'));

    expect(screen.getByText('49')).toBeInTheDocument();
  });

  it('affiche "Sur devis" pour le plan Enterprise, sans bouton de facturation', () => {
    render(<Pricing plans={mockPlans} />);

    expect(screen.getByText('Sur devis')).toBeInTheDocument();
  });
});
