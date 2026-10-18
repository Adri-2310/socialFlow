import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlanChange } from '@/components/cabinet/plan-change';
import type { PlanChangeOptions } from '@/lib/plan-change';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const options: PlanChangeOptions = {
  currentPlanId: 'pro',
  currentPeriod: 'monthly',
  canChange: true,
  reason: null,
  plans: [
    {
      planId: 'starter',
      name: 'Starter',
      description: '',
      features: [],
      isCurrentPlan: false,
      monthlyCents: 15000,
      yearlyCents: 144000,
      blockers: [{ quota: 'maxUtilisateurs', used: 5, limit: 3 }],
    },
    {
      planId: 'pro',
      name: 'Pro',
      description: '',
      features: [],
      isCurrentPlan: true,
      monthlyCents: 30000,
      yearlyCents: 288000,
      blockers: [],
    },
    {
      planId: 'enterprise',
      name: 'Enterprise',
      description: '',
      features: [],
      isCurrentPlan: false,
      monthlyCents: 75000,
      yearlyCents: 720000,
      blockers: [],
    },
  ],
};

beforeEach(() => {
  refresh.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PlanChange', () => {
  it('affiche les plans, marque le plan actuel et explique les limites depassees', () => {
    render(<PlanChange options={options} pending={null} effectiveAtLabel="5 décembre 2026" />);

    expect(screen.getByText('Plan actuel')).toBeInTheDocument();
    expect(
      screen.getByText(/Vous avez 5 gestionnaire\(s\), ce plan en autorise 3 : retirez-en 2/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choisir Starter' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Choisir Enterprise' })).toBeEnabled();
    expect(screen.getByText(/à la fin de la période en cours \(5 décembre 2026\)/)).toBeInTheDocument();
  });

  it('en annuel : total par an et equivalent mensuel en information', () => {
    render(<PlanChange options={options} pending={null} effectiveAtLabel={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Annuelle' }));

    expect(screen.getByText(/7\s?200\s?€ \/ an/)).toBeInTheDocument();
    expect(screen.getAllByText(/soit .* par mois, facturé une fois par an/).length).toBeGreaterThan(0);
  });

  it('demande confirmation puis programme le changement', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<PlanChange options={options} pending={null} effectiveAtLabel="5 décembre 2026" />);

    fireEvent.click(screen.getByRole('button', { name: 'Choisir Enterprise' }));
    expect(screen.getByText(/Passer à/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/billing/plan-change',
      expect.objectContaining({
        body: JSON.stringify({ planId: 'enterprise', billingPeriod: 'monthly' }),
      }),
    );
  });

  it('affiche l erreur du serveur sans rafraichir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'QUOTA_EXCEEDED' }) }),
    );
    render(<PlanChange options={options} pending={null} effectiveAtLabel={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Choisir Enterprise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('réduisez-la');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('affiche le changement programme et permet de l annuler', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <PlanChange
        options={options}
        pending={{
          planId: 'enterprise',
          planName: 'Enterprise',
          billingPeriod: 'yearly',
          effectiveAt: new Date('2026-12-05T10:00:00Z'),
          amountCents: 720000,
        }}
        effectiveAtLabel="5 décembre 2026"
      />,
    );

    expect(screen.getByText(/Changement de plan programmé/)).toBeInTheDocument();
    expect(screen.getByText(/le 5 décembre 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Choisir/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler le changement' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/billing/plan-change/cancel', { method: 'POST' });
  });

  it.each([
    ['STATE', /lorsque votre abonnement est en règle/],
    ['CANCELLING', /Reprenez votre abonnement/],
  ] as const)('explique pourquoi le changement est indisponible (%s)', (reason, text) => {
    render(
      <PlanChange
        options={{ ...options, canChange: false, reason }}
        pending={null}
        effectiveAtLabel={null}
      />,
    );

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Choisir/ })).not.toBeInTheDocument();
  });
});
