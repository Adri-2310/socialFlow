import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { LoginForm } from '@/components/auth/login-form';

const push = vi.fn();
const refresh = vi.fn();
let search = 'token=abc';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(search),
}));

const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();
vi.mock('@/lib/auth/auth-client', () => ({
  signIn: { email: vi.fn(), social: vi.fn() },
  twoFactor: { verifyTotp: vi.fn(), verifyBackupCode: vi.fn() },
  authClient: {
    requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
    resetPassword: (...args: unknown[]) => resetPassword(...args),
    signIn: { magicLink: vi.fn(), emailOtp: vi.fn() },
    emailOtp: { sendVerificationOtp: vi.fn() },
  },
}));

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  requestPasswordReset.mockReset().mockResolvedValue({ error: null });
  resetPassword.mockReset().mockResolvedValue({ error: null });
  search = 'token=abc';
});

describe('mot de passe oublié depuis le portail d un cabinet (D76, D77)', () => {
  it('sur SocialFlow : lien de l email et retour vers les pages de SocialFlow', async () => {
    render(<ForgotPasswordForm />);

    expect(screen.getByRole('link', { name: /Retour à la connexion/ })).toHaveAttribute('href', '/login');
    await userEvent.type(screen.getByLabelText('Adresse email'), 'marie@client.be');
    await userEvent.click(screen.getByRole('button', { name: /Envoyer le lien/ }));

    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: 'marie@client.be',
      redirectTo: '/reinitialiser-mot-de-passe',
    });
  });

  it('sur un portail : le lien de l email ramène sur une page du portail et le retour y va', async () => {
    render(<ForgotPasswordForm portal={{ slug: 'mon-cabinet' }} />);

    expect(screen.getByRole('link', { name: /Retour à la connexion/ })).toHaveAttribute(
      'href',
      '/connexion/mon-cabinet',
    );
    await userEvent.type(screen.getByLabelText('Adresse email'), 'marie@client.be');
    await userEvent.click(screen.getByRole('button', { name: /Envoyer le lien/ }));

    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: 'marie@client.be',
      redirectTo: '/connexion/mon-cabinet/reinitialiser-mot-de-passe',
    });
    // Après l'envoi aussi, le retour reste sur le portail.
    expect(await screen.findByRole('link', { name: /Retour à la connexion/ })).toHaveAttribute(
      'href',
      '/connexion/mon-cabinet',
    );
  });
});

describe('nouveau mot de passe depuis le portail d un cabinet', () => {
  async function changerLeMotDePasse() {
    await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), 'MotDePasse123!');
    await userEvent.type(screen.getByLabelText(/Confirmer/), 'MotDePasse123!');
    await userEvent.click(screen.getByRole('button', { name: /Réinitialiser|Enregistrer|Changer|Mettre à jour/ }));
  }

  it('revient sur le portail pour se connecter', async () => {
    render(<ResetPasswordForm portal={{ slug: 'mon-cabinet' }} />);
    await changerLeMotDePasse();

    await userEvent.click(await screen.findByRole('button', { name: 'Se connecter' }));
    expect(push).toHaveBeenCalledWith('/connexion/mon-cabinet');
  });

  it('sur SocialFlow, revient sur /login', async () => {
    render(<ResetPasswordForm />);
    await changerLeMotDePasse();

    await userEvent.click(await screen.findByRole('button', { name: 'Se connecter' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
  });
});

describe('lien « Oublié ? » de la connexion', () => {
  it('mène à la page du portail quand on se connecte par un portail', () => {
    render(<LoginForm portal={{ slug: 'mon-cabinet' }} />);
    expect(screen.getByRole('link', { name: 'Oublié ?' })).toHaveAttribute(
      'href',
      '/connexion/mon-cabinet/mot-de-passe-oublie',
    );
  });

  it('mène à la page de SocialFlow sinon', () => {
    render(<LoginForm />);
    expect(screen.getByRole('link', { name: 'Oublié ?' })).toHaveAttribute('href', '/mot-de-passe-oublie');
  });
});
