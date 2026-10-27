import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubscriptionDetails } from '@/components/cabinet/subscription-details';
import type { CabinetSubscriptionDetails } from '@/lib/billing/cabinet-billing';
import type { BillingExtras } from '@/lib/billing/cabinet-subscription';
import type { PlanChangeOptions } from '@/lib/billing/plan-change';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const base: CabinetSubscriptionDetails = {
  planName: 'Pro',
  planDescription: 'Pour les cabinets en croissance.',
  features: ['10 gestionnaires', '25 Go de stockage'],
  billingPeriod: 'monthly',
  status: 'ACTIF',
  trialEndsAt: null,
  currentPeriodEnd: new Date('2026-12-05T10:00:00Z'),
  cancelAtPeriodEnd: false,
  graceEndsAt: null,
  amountCents: 30000,
  monthlyEquivalentCents: null,
};

const extras: BillingExtras = {
  card: { brand: 'visa', last4: '4242', expMonth: 3, expYear: 2034 },
  invoices: [
    {
      id: 'in_1',
      number: 'ABCD-0001',
      date: new Date('2026-11-14T10:00:00Z'),
      amountCents: 30000,
      currency: 'eur',
      status: 'paid',
      pdfUrl: 'https://pay.stripe.com/invoice/in_1/pdf',
    },
  ],
  pendingChange: null,
  available: true,
};

const planChange: PlanChangeOptions = {
  currentPlanId: 'pro',
  currentPeriod: 'monthly',
  canChange: true,
  reason: null,
  plans: [],
};

describe('SubscriptionDetails', () => {
  it('affiche le plan, la periode et le montant mensuel', () => {
    render(<SubscriptionDetails data={base} extras={extras} planChange={planChange} />);

    expect(screen.getByRole('heading', { name: 'Pro' })).toBeInTheDocument();
    expect(screen.getAllByText('Mensuelle').length).toBeGreaterThan(0);
    expect(screen.getByText(/300\s?€ par mois/)).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText(/Prochain paiement de .*300.* le 5 décembre 2026/)).toBeInTheDocument();
  });

  it('en annuel : total par an en avant, mensuel equivalent en information (D58)', () => {
    render(
      <SubscriptionDetails
        data={{ ...base, billingPeriod: 'yearly', amountCents: 720000, monthlyEquivalentCents: 60000 }}
        extras={extras}
        planChange={planChange}
      />,
    );

    expect(screen.getAllByText('Annuelle').length).toBeGreaterThan(0);
    expect(screen.getByText(/7\s?200\s?€ par an/)).toBeInTheDocument();
    expect(screen.getByText(/soit 600\s?€ par mois, facturé une fois par an/)).toBeInTheDocument();
  });

  it('en essai : date de fin et premier paiement', () => {
    render(
      <SubscriptionDetails
        data={{ ...base, status: 'ESSAI', trialEndsAt: new Date(Date.now() + 10 * 86_400_000) }}
        extras={extras}
        planChange={planChange}
      />,
    );

    expect(screen.getByText(/Essai gratuit jusqu’au/)).toBeInTheDocument();
    expect(screen.getByText(/Premier paiement de .*300/)).toBeInTheDocument();
  });

  it('en delai de grace : indique la date limite pour regulariser', () => {
    render(
      <SubscriptionDetails
        data={{ ...base, status: 'DELAI_GRACE', graceEndsAt: new Date('2026-10-20T10:00:00Z') }}
        extras={extras}
        planChange={planChange}
      />,
    );

    expect(screen.getByText(/Régularisez avant le 20 octobre 2026/)).toBeInTheDocument();
  });

  it.each([
    ['IMPAYE', /lecture seule pour impayé/],
    ['RESILIE', /Abonnement résilié/],
  ] as const)('explique l etat %s, sans proposer de resilier', (status, text) => {
    render(<SubscriptionDetails data={{ ...base, status }} extras={extras} planChange={planChange} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Résilier mon abonnement/ })).not.toBeInTheDocument();
  });

  it('propose de resilier un abonnement actif', () => {
    render(<SubscriptionDetails data={base} extras={extras} planChange={planChange} />);

    expect(screen.getByRole('button', { name: 'Résilier mon abonnement' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reprendre mon abonnement' })).not.toBeInTheDocument();
  });

  it('resiliation programmee : date de fin d acces et bouton de reprise (D59)', () => {
    render(<SubscriptionDetails data={{ ...base, cancelAtPeriodEnd: true }} extras={extras} planChange={planChange} />);

    expect(screen.getByText(/Résiliation programmée : vous gardez l’accès jusqu’au 5 décembre 2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reprendre mon abonnement' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Résilier mon abonnement' })).not.toBeInTheDocument();
  });

  it('affiche la carte enregistree, sans jamais proposer de la supprimer', () => {
    render(<SubscriptionDetails data={base} extras={extras} planChange={planChange} />);

    expect(screen.getByText(/4242/)).toBeInTheDocument();
    expect(screen.getByText(/expire 03\/2034/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier ma carte' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /supprimer/i })).not.toBeInTheDocument();
  });

  it('propose d ajouter une carte quand il n y en a aucune', () => {
    render(<SubscriptionDetails data={base} extras={{ ...extras, card: null }} planChange={planChange} />);

    expect(screen.getByText('Aucune carte enregistrée.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter une carte' })).toBeInTheDocument();
  });

  it('liste les factures avec leur PDF', () => {
    render(<SubscriptionDetails data={base} extras={extras} planChange={planChange} />);

    expect(screen.getByText('ABCD-0001')).toBeInTheDocument();
    expect(screen.getByText('Payée')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /PDF/ })).toHaveAttribute(
      'href',
      'https://pay.stripe.com/invoice/in_1/pdf',
    );
  });

  it('nomme les colonnes du tableau des factures, dont la colonne de téléchargement', () => {
    render(<SubscriptionDetails data={base} extras={extras} planChange={planChange} />);

    for (const nom of ['Date', 'Numéro', 'Montant', 'Statut', 'Télécharger']) {
      expect(screen.getByRole('columnheader', { name: nom })).toBeInTheDocument();
    }
  });

  it('indique quand il n y a aucune facture ou que Stripe est injoignable', () => {
    const { rerender } = render(
      <SubscriptionDetails data={base} extras={{ ...extras, invoices: [] }} planChange={planChange} />,
    );
    expect(screen.getByText(/Aucune facture pour le moment/)).toBeInTheDocument();

    rerender(
      <SubscriptionDetails
        data={base}
        extras={{ card: null, invoices: [], pendingChange: null, available: false }}
        planChange={planChange}
      />,
    );
    expect(screen.getByText(/factures sont momentanément indisponibles/)).toBeInTheDocument();
  });

  it('affiche le retour de la saisie de carte', () => {
    render(<SubscriptionDetails data={base} extras={extras} planChange={planChange} flash="ok" />);
    expect(screen.getByRole('status')).toHaveTextContent('Votre carte bancaire a été mise à jour');
  });

  it('tolere un cabinet sans plan connu', () => {
    render(
      <SubscriptionDetails
        data={{
          ...base,
          planName: null,
          planDescription: null,
          features: [],
          billingPeriod: null,
          amountCents: null,
        }}
        extras={extras}
        planChange={planChange}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Aucun plan' })).toBeInTheDocument();
  });
});
