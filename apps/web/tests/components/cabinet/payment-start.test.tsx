import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentStart } from '@/components/cabinet/payment-start';

const fetchMock = vi.fn();
const assign = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  fetchMock.mockReset();
  assign.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, assign },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

const base = {
  planName: 'Starter',
  periodLabel: 'Mensuelle',
  priceLabel: '150 € par mois',
  trialDays: 30,
};

describe('PaymentStart (D32)', () => {
  it('presente le plan du cabinet, le prix et la duree de l essai', () => {
    render(<PaymentStart {...base} />);

    expect(screen.getByText('Finalisez votre abonnement')).toBeInTheDocument();
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Mensuelle')).toBeInTheDocument();
    expect(screen.getByText('150 € par mois')).toBeInTheDocument();
    expect(screen.getByText('30 jours')).toBeInTheDocument();
    expect(screen.getByText(/ne sera débitée qu'à la fin des 30 jours/)).toBeInTheDocument();
  });

  it('masque le prix quand il est indisponible', () => {
    render(<PaymentStart {...base} priceLabel={null} />);
    expect(screen.queryByText(/Prix après l'essai/)).not.toBeInTheDocument();
  });

  it('demande une session puis envoie vers la page de paiement Stripe', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_abc' }),
    });
    render(<PaymentStart {...base} />);

    await userEvent.click(screen.getByRole('button', { name: 'Démarrer mon essai gratuit' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/billing/checkout', { method: 'POST' });
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_abc'),
    );
  });

  it('affiche un message lisible quand la session ne peut pas etre creee', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'CHECKOUT_FAILED' }),
    });
    render(<PaymentStart {...base} />);

    await userEvent.click(screen.getByRole('button', { name: 'Démarrer mon essai gratuit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le service de paiement est momentanément indisponible',
    );
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Démarrer mon essai gratuit' })).toBeEnabled();
  });

  it('informe d un paiement non finalise apres un retour sans paiement', () => {
    render(<PaymentStart {...base} cancelled />);
    expect(screen.getByRole('status')).toHaveTextContent("Le paiement n'a pas été finalisé");
  });

  it('affiche l erreur de confirmation au retour de Stripe', () => {
    render(<PaymentStart {...base} confirmError="CHECKOUT_FAILED" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
