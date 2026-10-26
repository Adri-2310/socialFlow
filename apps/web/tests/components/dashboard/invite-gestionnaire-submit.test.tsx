import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InviteGestionnaire } from '@/components/dashboard/invite-gestionnaire';

// Envoi de l'invitation d'un gestionnaire (D15). Le quota est testé dans
// invite-gestionnaire.test.tsx ; ici, ce que fait le formulaire quand on l'envoie.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const field = () => screen.getByPlaceholderText('gestionnaire@cabinet.be');

describe('InviteGestionnaire : envoi', () => {
  it('envoie l’adresse, confirme, vide le champ et rafraîchit la page', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true }) });
    render(<InviteGestionnaire />);

    await userEvent.type(field(), 'nouveau@cabinet.be');
    await userEvent.click(screen.getByRole('button', { name: 'Inviter' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nouveau@cabinet.be' }),
    });
    expect(await screen.findByText('Invitation envoyée.')).toBeInTheDocument();
    expect(field()).toHaveValue('');
    expect(refresh).toHaveBeenCalled();
  });

  it('attend une adresse email : champ obligatoire de type email', () => {
    render(<InviteGestionnaire />);

    expect(field()).toBeRequired();
    expect(field()).toHaveAttribute('type', 'email');
  });

  it.each([
    ['EMAIL_ALREADY_USED', 'Un compte existe déjà avec cette adresse email.'],
    ['INVITATION_ALREADY_PENDING', 'Une invitation est déjà en attente pour cette adresse.'],
    ['CABINET_READ_ONLY', /lecture seule/],
    ['FORBIDDEN', /pas autorisé à inviter un gestionnaire/],
  ])('explique l’erreur %s sans rafraîchir ni confirmer', async (code, message) => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: code }) });
    render(<InviteGestionnaire />);

    await userEvent.type(field(), 'a@b.be');
    await userEvent.click(screen.getByRole('button', { name: 'Inviter' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText('Invitation envoyée.')).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    // L'adresse saisie reste pour être corrigée.
    expect(field()).toHaveValue('a@b.be');
  });

  it('explique le quota refusé par le serveur', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'QUOTA_EXCEEDED', quota: 'maxGestionnaires', limit: 3, used: 3 }),
    });
    render(<InviteGestionnaire />);

    await userEvent.type(field(), 'a@b.be');
    await userEvent.click(screen.getByRole('button', { name: 'Inviter' }));

    expect(await screen.findByText(/quota de gestionnaires de votre plan est atteint/)).toBeInTheDocument();
  });

  it('retombe sur un message générique pour une erreur inconnue', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'INCONNUE' }) });
    render(<InviteGestionnaire />);

    await userEvent.type(field(), 'a@b.be');
    await userEvent.click(screen.getByRole('button', { name: 'Inviter' }));

    expect(await screen.findByText('Une erreur est survenue. Veuillez réessayer.')).toBeInTheDocument();
  });

  it('désactive le bouton pendant l’envoi', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<InviteGestionnaire />);

    await userEvent.type(field(), 'a@b.be');
    await userEvent.click(screen.getByRole('button', { name: 'Inviter' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Inviter' })).toBeDisabled());
    finish({ ok: true, status: 201, json: async () => ({ success: true }) });
    expect(await screen.findByText('Invitation envoyée.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inviter' })).toBeEnabled();
  });
});
