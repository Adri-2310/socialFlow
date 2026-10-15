import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BillingBanner } from '@/components/cabinet/billing-banner';

describe('BillingBanner', () => {
  it('ne montre rien quand l abonnement est en regle', () => {
    for (const status of ['ESSAI', 'ACTIF', 'EN_ATTENTE_PAIEMENT'] as const) {
      const { container, unmount } = render(<BillingBanner status={status} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('annonce le delai de grace avec sa date limite', () => {
    render(<BillingBanner status="DELAI_GRACE" graceEndsAt={new Date('2026-10-20T14:00:00Z')} />);

    expect(screen.getByText('Paiement en échec')).toBeInTheDocument();
    expect(screen.getByText(/avant le 20\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('reste lisible sans date de fin de delai', () => {
    render(<BillingBanner status="DELAI_GRACE" graceEndsAt={null} />);
    expect(screen.getByText(/Régularisez votre abonnement pour éviter/)).toBeInTheDocument();
  });

  it('annonce la lecture seule pour impaye et pour resiliation', () => {
    const { rerender } = render(<BillingBanner status="IMPAYE" />);
    expect(screen.getByText('Cabinet en lecture seule pour impayé')).toBeInTheDocument();
    expect(screen.getByText(/Vos clients gardent l'accès/)).toBeInTheDocument();

    rerender(<BillingBanner status="RESILIE" />);
    expect(screen.getByText('Abonnement résilié : cabinet en lecture seule')).toBeInTheDocument();
  });
});
