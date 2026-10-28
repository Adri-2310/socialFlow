import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CancelSubscriptionButton,
  CardUpdateButton,
  ResumeSubscriptionButton,
} from '@/components/cabinet/subscription-actions';

// Actions de la page « Mon abonnement » (D59) : carte, résiliation en fin de période, reprise.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();
const assign = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  assign.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('location', { ...window.location, assign });
});
afterEach(() => vi.unstubAllGlobals());

const reponse = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

describe('CardUpdateButton', () => {
  it('propose « Modifier ma carte » par défaut, ou le libellé demandé', () => {
    const { unmount } = render(<CardUpdateButton />);
    expect(screen.getByRole('button', { name: 'Modifier ma carte' })).toBeInTheDocument();
    unmount();

    render(<CardUpdateButton label="Ajouter une carte" />);
    expect(screen.getByRole('button', { name: 'Ajouter une carte' })).toBeInTheDocument();
  });

  it('redirige vers la page de saisie hébergée par Stripe', async () => {
    fetchMock.mockResolvedValue(reponse(200, { url: 'https://stripe.test/session' }));
    render(<CardUpdateButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Modifier ma carte' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://stripe.test/session'));
    expect(fetchMock).toHaveBeenCalledWith('/api/billing/card', { method: 'POST' });
  });

  it('explique un refus et reste utilisable', async () => {
    fetchMock.mockResolvedValue(reponse(502, { error: 'STRIPE_FAILED' }));
    render(<CardUpdateButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Modifier ma carte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le service de paiement est momentanément indisponible. Réessayez dans un instant.',
    );
    expect(screen.getByRole('button', { name: 'Modifier ma carte' })).toBeEnabled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('retombe sur un message générique si la réponse n’a pas d’adresse', async () => {
    fetchMock.mockResolvedValue(reponse(200, {}));
    render(<CardUpdateButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Modifier ma carte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Une erreur est survenue. Veuillez réessayer.',
    );
  });

  it('retombe sur un message générique en cas de panne réseau', async () => {
    fetchMock.mockRejectedValue(new Error('réseau'));
    render(<CardUpdateButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Modifier ma carte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Une erreur est survenue. Veuillez réessayer.',
    );
  });
});

describe('CancelSubscriptionButton', () => {
  it('demande une confirmation explicite avant de résilier, en citant la date de fin', async () => {
    render(<CancelSubscriptionButton endDateLabel="31/12/2026" />);

    await userEvent.click(screen.getByRole('button', { name: 'Résilier mon abonnement' }));

    expect(screen.getByText('Résilier votre abonnement ?')).toBeInTheDocument();
    expect(screen.getByText(/jusqu’au 31\/12\/2026/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sans date connue, parle de la fin de la période en cours', async () => {
    render(<CancelSubscriptionButton endDateLabel={null} />);

    await userEvent.click(screen.getByRole('button', { name: 'Résilier mon abonnement' }));

    expect(screen.getByText(/fin de la période en cours/)).toBeInTheDocument();
  });

  it('« Conserver mon abonnement » revient au bouton sans rien envoyer', async () => {
    render(<CancelSubscriptionButton endDateLabel={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Résilier mon abonnement' }));

    await userEvent.click(screen.getByRole('button', { name: 'Conserver mon abonnement' }));

    expect(screen.getByRole('button', { name: 'Résilier mon abonnement' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('confirme la résiliation, puis rafraîchit', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    render(<CancelSubscriptionButton endDateLabel={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Résilier mon abonnement' }));

    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la résiliation' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/billing/subscription/cancel', { method: 'POST' });
  });

  it('explique un refus et garde la confirmation ouverte', async () => {
    fetchMock.mockResolvedValue(reponse(409, { error: 'ALREADY_CANCELLING' }));
    render(<CancelSubscriptionButton endDateLabel={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Résilier mon abonnement' }));

    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la résiliation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La résiliation est déjà programmée.',
    );
    expect(screen.getByRole('button', { name: 'Confirmer la résiliation' })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('désactive les deux boutons pendant l’envoi', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<CancelSubscriptionButton endDateLabel={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Résilier mon abonnement' }));

    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la résiliation' }));

    expect(screen.getByRole('button', { name: 'Confirmer la résiliation' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Conserver mon abonnement' })).toBeDisabled();
    finish(reponse(200, { success: true }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe('ResumeSubscriptionButton', () => {
  it('reprend l’abonnement puis rafraîchit', async () => {
    fetchMock.mockResolvedValue(reponse(200, { success: true }));
    render(<ResumeSubscriptionButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Reprendre mon abonnement' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/billing/subscription/resume', { method: 'POST' });
  });

  it('explique un refus', async () => {
    fetchMock.mockResolvedValue(reponse(409, { error: 'NOT_CANCELLING' }));
    render(<ResumeSubscriptionButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Reprendre mon abonnement' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Aucune résiliation n'est programmée.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
