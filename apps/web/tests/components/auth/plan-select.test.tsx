import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanSelect } from '@/components/auth/plan-select';
import type { Plan } from '@/lib/billing/plans';

// Choix de la formule à l'inscription : bascule Mensuel/Annuel (D58) et une carte par plan.
const plans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Pour démarrer',
    monthlyPrice: 49,
    yearlyPrice: 40,
    highlighted: false,
    badge: null,
    features: ['Jusqu’à 10 salariés', 'Support email', 'Troisième ligne masquée'],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Pour grandir',
    monthlyPrice: 99,
    yearlyPrice: 80,
    highlighted: true,
    badge: 'Populaire',
    features: ['Salariés illimités', 'Support prioritaire'],
  },
];

describe('PlanSelect', () => {
  it('affiche une carte par formule, avec description, badge et deux avantages', () => {
    render(<PlanSelect plans={plans} onSelect={vi.fn()} />);

    const starter = screen.getByRole('button', { name: /Starter/ });
    expect(starter).toHaveTextContent('Pour démarrer');
    expect(starter).toHaveTextContent('Jusqu’à 10 salariés');
    expect(starter).toHaveTextContent('Support email');
    expect(starter).not.toHaveTextContent('Troisième ligne masquée');
    const pro = screen.getByRole('button', { name: /Pro/ });
    expect(pro).toHaveTextContent('Populaire');
  });

  it('affiche les prix mensuels par défaut', () => {
    render(<PlanSelect plans={plans} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Starter/ })).toHaveTextContent('49€/mois');
    expect(screen.getByRole('button', { name: /Pro/ })).toHaveTextContent('99€/mois');
  });

  it('« Annuel » affiche le total de l’année et l’équivalent mensuel', async () => {
    render(<PlanSelect plans={plans} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Annuel/ }));

    const starter = screen.getByRole('button', { name: /Starter/ });
    expect(starter).toHaveTextContent('480€/an');
    expect(starter).toHaveTextContent('soit 40 € par mois, facturé une fois par an');
    expect(screen.getByRole('button', { name: /Pro/ })).toHaveTextContent('960€/an');
  });

  it('revient aux prix mensuels avec « Mensuel »', async () => {
    render(<PlanSelect plans={plans} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Annuel/ }));

    await userEvent.click(screen.getByRole('button', { name: 'Mensuel' }));

    expect(screen.getByRole('button', { name: /Starter/ })).toHaveTextContent('49€/mois');
  });

  it('indique la période active avec aria-pressed', async () => {
    render(<PlanSelect plans={plans} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Mensuel' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Annuel/ })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: /Annuel/ }));

    expect(screen.getByRole('button', { name: 'Mensuel' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Annuel/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('transmet la formule choisie avec la période mensuelle par défaut', async () => {
    const onSelect = vi.fn();
    render(<PlanSelect plans={plans} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /Pro/ }));

    expect(onSelect).toHaveBeenCalledWith('pro', 'monthly');
  });

  it('transmet la période annuelle quand elle est choisie', async () => {
    const onSelect = vi.fn();
    render(<PlanSelect plans={plans} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /Annuel/ }));

    await userEvent.click(screen.getByRole('button', { name: /Starter/ }));

    expect(onSelect).toHaveBeenCalledWith('starter', 'yearly');
  });
});
