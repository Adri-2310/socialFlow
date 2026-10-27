import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FacturationAbonnements } from '@/components/admin/facturation-abonnements';
import type { BillingRow } from '@/lib/admin/admin-data';

// Facturation de la plateforme : MRR et abonnements Stripe, console SuperAdmin.
const ligne = (surcharge: Partial<BillingRow> = {}): BillingRow => ({
  cabinetId: 'c1',
  cabinetName: 'Cabinet Alicia',
  planLabel: 'starter',
  amount: 49,
  currency: 'eur',
  interval: 'month',
  status: 'active',
  currentPeriodEnd: '2026-11-30T00:00:00.000Z',
  ...surcharge,
});

describe('FacturationAbonnements', () => {
  it('affiche le MRR en euros et le nombre d’abonnements actifs ou en essai', () => {
    render(
      <FacturationAbonnements
        mrr={98}
        rows={[
          ligne(),
          ligne({ cabinetId: 'c2', cabinetName: 'B', status: 'trialing' }),
          ligne({ cabinetId: 'c3', cabinetName: 'C', status: 'canceled' }),
        ]}
      />,
    );

    expect(screen.getByText('98 €')).toBeInTheDocument();
    expect(screen.getByText(/MRR \(revenu mensuel récurrent, 2/)).toBeInTheDocument();
  });

  it('liste chaque abonnement : cabinet, plan, montant par période, échéance', () => {
    render(<FacturationAbonnements mrr={49} rows={[ligne()]} />);

    const rangee = screen.getByRole('row', { name: /Cabinet Alicia/ });
    expect(within(rangee).getByText('Starter')).toBeInTheDocument();
    expect(within(rangee).getByText(/49 €/)).toBeInTheDocument();
    expect(within(rangee).getByText('/ mois')).toBeInTheDocument();
    expect(within(rangee).getByText('30 nov. 2026')).toBeInTheDocument();
  });

  it('montant annuel et plan inconnu : affiche « / an » et le plan tel quel', () => {
    render(
      <FacturationAbonnements
        mrr={0}
        rows={[ligne({ interval: 'year', planLabel: 'sur-mesure', currentPeriodEnd: null })]}
      />,
    );

    const rangee = screen.getByRole('row', { name: /Cabinet Alicia/ });
    expect(within(rangee).getByText('/ an')).toBeInTheDocument();
    expect(within(rangee).getByText('sur-mesure')).toBeInTheDocument();
    expect(within(rangee).getAllByText('—')).toHaveLength(1);
  });

  it('sans plan : un tiret à la place du plan', () => {
    render(<FacturationAbonnements mrr={0} rows={[ligne({ planLabel: null, interval: null })]} />);

    expect(within(screen.getByRole('row', { name: /Cabinet Alicia/ })).getByText('—')).toBeInTheDocument();
  });

  it.each([
    ['active', 'Actif'],
    ['trialing', 'Essai'],
    ['past_due', 'Paiement en retard'],
    ['unpaid', 'Impayé'],
    ['canceled', 'Annulé'],
    ['incomplete', 'Incomplet'],
    ['incomplete_expired', 'Expiré'],
    ['paused', 'En pause'],
  ])('statut Stripe « %s » : affiche « %s »', (status, libelle) => {
    render(<FacturationAbonnements mrr={0} rows={[ligne({ status })]} />);

    expect(screen.getByText(libelle)).toBeInTheDocument();
  });

  it('un statut inconnu est affiché tel quel', () => {
    render(<FacturationAbonnements mrr={0} rows={[ligne({ status: 'nouveau_statut' })]} />);

    expect(screen.getByText('nouveau_statut')).toBeInTheDocument();
  });

  it('sans abonnement : le dit', () => {
    render(<FacturationAbonnements mrr={0} rows={[]} />);

    expect(screen.getByText('Aucun abonnement Stripe pour le moment.')).toBeInTheDocument();
  });

  it('nomme les cinq colonnes du tableau', () => {
    render(<FacturationAbonnements mrr={0} rows={[]} />);

    for (const nom of ['Cabinet', 'Plan', 'Montant', 'Prochaine échéance', 'Statut']) {
      expect(screen.getByRole('columnheader', { name: nom })).toBeInTheDocument();
    }
  });
});
