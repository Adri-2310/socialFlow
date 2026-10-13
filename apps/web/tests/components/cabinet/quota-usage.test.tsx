import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuotaUsage } from '@/components/cabinet/quota-usage';
import type { CabinetQuotaUsage } from '@/lib/cabinet-quotas';

const base: CabinetQuotaUsage = {
  limits: { maxEntreprises: 25, maxUtilisateurs: 3, maxStorageMb: 5120 },
  utilisateurs: { members: 2, pendingInvitations: 0, used: 2 },
  entreprises: { used: 0 },
  storageMb: { used: 0 },
};

describe('QuotaUsage', () => {
  it('affiche utilise / maximum pour chaque quota', () => {
    render(<QuotaUsage data={base} />);

    expect(screen.getByText('Gestionnaires RH')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Gestionnaires RH' })).toHaveAttribute(
      'aria-valuenow',
      '2',
    );
    expect(screen.getByText(/5 Go/)).toBeInTheDocument();
    expect(screen.queryByText(/Quota atteint/)).not.toBeInTheDocument();
  });

  it('signale les invitations en attente et le quota atteint', () => {
    render(
      <QuotaUsage
        data={{ ...base, utilisateurs: { members: 2, pendingInvitations: 1, used: 3 } }}
      />,
    );

    expect(screen.getByText('dont 1 invitation en attente')).toBeInTheDocument();
    expect(screen.getByText(/Quota atteint/)).toBeInTheDocument();
  });

  it('affiche illimite sans barre de progression', () => {
    render(
      <QuotaUsage
        data={{
          ...base,
          limits: { maxEntreprises: null, maxUtilisateurs: null, maxStorageMb: 102400 },
        }}
      />,
    );

    expect(screen.getAllByText(/illimité/)).toHaveLength(2);
    expect(screen.queryByRole('progressbar', { name: 'Gestionnaires RH' })).toBeNull();
    expect(screen.getByText(/100 Go/)).toBeInTheDocument();
  });

  it('explique l absence de plan', () => {
    render(<QuotaUsage data={{ ...base, limits: null }} />);
    expect(screen.getByText(/aucun quota n'est appliqué/)).toBeInTheDocument();
  });
});
