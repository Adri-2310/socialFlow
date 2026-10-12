import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewCards } from '@/components/cabinet/overview-cards';
import type { CabinetOverview } from '@/lib/cabinet-data';

const base: CabinetOverview = {
  cabinetName: 'Cabinet Test',
  gestionnaires: { total: 3, actifs: 2, suspendus: 1 },
  pendingInvitations: 1,
  subscription: { planName: 'Pro', billingPeriod: 'yearly' },
};

describe('OverviewCards', () => {
  it('affiche les compteurs et le plan', () => {
    render(<OverviewCards data={base} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Gestionnaires RH')).toBeInTheDocument();
    expect(screen.getByText('dont 1 suspendu')).toBeInTheDocument();
    expect(screen.getByText('Invitation en attente')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Facturation annuelle')).toBeInTheDocument();
  });

  it('accorde au singulier et masque la mention suspendus quand il y en a zero', () => {
    render(
      <OverviewCards
        data={{
          ...base,
          gestionnaires: { total: 1, actifs: 1, suspendus: 0 },
          pendingInvitations: 0,
        }}
      />,
    );
    expect(screen.getByText('Gestionnaire RH')).toBeInTheDocument();
    expect(screen.queryByText(/dont/)).not.toBeInTheDocument();
    // En francais, 0 est singulier.
    expect(screen.getByText('Invitation en attente')).toBeInTheDocument();
  });

  it('affiche "Aucun plan" sans abonnement', () => {
    render(
      <OverviewCards data={{ ...base, subscription: { planName: null, billingPeriod: null } }} />,
    );
    expect(screen.getByText('Aucun plan')).toBeInTheDocument();
    expect(screen.getByText('Abonnement')).toBeInTheDocument();
  });

  it('signale les entreprises clientes comme a venir', () => {
    render(<OverviewCards data={base} />);
    expect(screen.getByText('Entreprises clientes')).toBeInTheDocument();
    expect(screen.getByText('Bientôt disponible')).toBeInTheDocument();
  });
});
