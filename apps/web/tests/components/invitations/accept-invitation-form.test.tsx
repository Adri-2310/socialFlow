import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcceptInvitationForm } from '@/components/invitations/accept-invitation-form';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  vi.unstubAllGlobals();
});

async function creerLeCompte() {
  await userEvent.type(screen.getByLabelText('Nom complet'), 'Bruno Test');
  await userEvent.type(screen.getByLabelText('Mot de passe'), 'MotDePasse123!');
  await userEvent.type(screen.getByLabelText('Confirmer le mot de passe'), 'MotDePasse123!');
  await userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
}

describe('AcceptInvitationForm', () => {
  it('affiche l adresse du portail apres la creation, avant d entrer dans l espace (D76)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, portalUrl: 'https://app.test/connexion/alicia' }) }),
    );
    render(<AcceptInvitationForm token="t" email="a@b.be" />);

    await creerLeCompte();

    expect(await screen.findByText('Votre compte est créé')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse du portail')).toHaveTextContent('https://app.test/connexion/alicia');
    expect(push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Accéder à mon espace' }));
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('complete une adresse relative avec l origine du site', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, portalUrl: '/connexion/alicia' }) }),
    );
    render(<AcceptInvitationForm token="t" email="a@b.be" />);

    await creerLeCompte();

    expect(await screen.findByLabelText('Adresse du portail')).toHaveTextContent(
      `${window.location.origin}/connexion/alicia`,
    );
  });

  it('masque les mots de passe par defaut puis les affiche via le bouton', async () => {
    render(<AcceptInvitationForm token="t" email="a@b.be" />);
    const password = screen.getByLabelText('Mot de passe');
    const confirm = screen.getByLabelText('Confirmer le mot de passe');
    expect(password).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: 'Afficher les mots de passe' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(confirm).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'Masquer les mots de passe' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');
  });
});
