import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterFlow } from '@/components/auth/register-flow';
import type { Plan } from '@/lib/billing/plans';

// Parcours d'inscription : choix de la formule, puis formulaire, avec retour possible.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/auth/auth-client', () => ({
  signUp: { email: vi.fn() },
  signIn: { social: vi.fn() },
}));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));

const plans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Pour démarrer',
    monthlyPrice: 49,
    yearlyPrice: 40,
    highlighted: false,
    badge: null,
    features: ['Support email'],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Pour grandir',
    monthlyPrice: 99,
    yearlyPrice: 80,
    highlighted: true,
    badge: null,
    features: ['Support prioritaire'],
  },
];

describe('RegisterFlow', () => {
  it('sans formule choisie, propose le choix des formules', () => {
    render(<RegisterFlow plans={plans} initialPlanId={null} />);

    expect(screen.getByRole('heading', { name: 'Choisissez votre formule' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Accueil' })).toHaveAttribute('href', '/');
    expect(screen.queryByLabelText('Nom du cabinet')).not.toBeInTheDocument();
  });

  it('choisir une formule affiche le formulaire avec la formule et la période', async () => {
    render(<RegisterFlow plans={plans} initialPlanId={null} />);
    await userEvent.click(screen.getByRole('button', { name: /Annuel/ }));

    await userEvent.click(screen.getByRole('button', { name: /Pro/ }));

    expect(screen.getByRole('heading', { name: 'Créer un compte' })).toBeInTheDocument();
    expect(screen.getByText('Pro · Annuel')).toBeInTheDocument();
    expect(screen.getByLabelText('Nom du cabinet')).toBeInTheDocument();
  });

  it('avec une formule déjà choisie, ouvre directement le formulaire en mensuel', () => {
    render(<RegisterFlow plans={plans} initialPlanId="starter" />);

    expect(screen.getByRole('heading', { name: 'Créer un compte' })).toBeInTheDocument();
    expect(screen.getByText('Starter · Mensuel')).toBeInTheDocument();
  });

  it('une formule inconnue retombe sur le choix des formules', () => {
    render(<RegisterFlow plans={plans} initialPlanId="inconnu" />);

    expect(screen.getByRole('heading', { name: 'Choisissez votre formule' })).toBeInTheDocument();
  });

  it('« Changer de formule » revient au choix', async () => {
    render(<RegisterFlow plans={plans} initialPlanId="starter" />);

    await userEvent.click(screen.getByRole('button', { name: 'Changer de formule' }));

    expect(screen.getByRole('heading', { name: 'Choisissez votre formule' })).toBeInTheDocument();
  });
});
