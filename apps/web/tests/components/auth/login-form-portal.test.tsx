import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/components/auth/login-form';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const signInEmail = vi.fn();
const signInSocial = vi.fn();
vi.mock('@/lib/auth/auth-client', () => ({
  signIn: {
    email: (...args: unknown[]) => signInEmail(...args),
    social: (...args: unknown[]) => signInSocial(...args),
  },
  twoFactor: { verifyTotp: vi.fn(), verifyBackupCode: vi.fn() },
  authClient: { signIn: { magicLink: vi.fn(), emailOtp: vi.fn() }, emailOtp: { sendVerificationOtp: vi.fn() } },
}));

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  signInEmail.mockReset();
  signInSocial.mockReset().mockResolvedValue({ error: null });
  document.cookie = 'sf-portal=; path=/; max-age=0';
});

async function seConnecter() {
  await userEvent.type(screen.getByLabelText('Adresse email'), 'marie@client.be');
  await userEvent.type(screen.getByLabelText('Mot de passe'), 'MotDePasse123!');
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('LoginForm : page de SocialFlow', () => {
  it('propose de creer un compte et n annonce aucun portail', async () => {
    signInEmail.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm />);

    expect(screen.getByRole('link', { name: 'Créer un compte' })).toHaveAttribute('href', '/register');
    await seConnecter();

    expect(signInEmail).toHaveBeenCalledWith(
      { email: 'marie@client.be', password: 'MotDePasse123!', rememberMe: true },
      undefined,
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/bienvenue'));
  });

  it('refuse un compte de cabinet client et propose le portail de son cabinet', async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { code: 'PORTAL_REQUIRED', message: '/connexion/mon-cabinet' },
    });
    render(<LoginForm />);

    await seConnecter();

    expect(await screen.findByText(/se connecte par le portail de votre cabinet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir le portail de mon cabinet' })).toHaveAttribute(
      'href',
      '/connexion/mon-cabinet',
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('n ouvre jamais un lien qui ne serait pas un portail', async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { code: 'PORTAL_REQUIRED', message: 'https://evil.test/' },
    });
    render(<LoginForm />);

    await seConnecter();

    await screen.findByText(/se connecte par le portail de votre cabinet/);
    expect(screen.queryByRole('link', { name: 'Ouvrir le portail de mon cabinet' })).not.toBeInTheDocument();
  });
});

describe('LoginForm : portail d un cabinet (D76)', () => {
  it('annonce le portail au serveur par un en-tete et entre directement dans l espace', async () => {
    signInEmail.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm portal={{ slug: 'mon-cabinet' }} />);

    await seConnecter();

    expect(signInEmail).toHaveBeenCalledWith(
      { email: 'marie@client.be', password: 'MotDePasse123!', rememberMe: true },
      { headers: { 'x-sf-portal': 'mon-cabinet' } },
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
  });

  it('ne propose pas de creer un compte et explique Google et Microsoft', () => {
    render(<LoginForm portal={{ slug: 'mon-cabinet' }} />);

    expect(screen.queryByRole('link', { name: 'Créer un compte' })).not.toBeInTheDocument();
    expect(screen.getByText(/Google et Microsoft fonctionnent une fois votre compte lié/)).toBeInTheDocument();
  });

  it('Google : pose le cookie du portail et revient par une page du portail', async () => {
    render(<LoginForm portal={{ slug: 'mon-cabinet' }} />);

    await userEvent.click(screen.getByRole('button', { name: /Google/ }));

    expect(document.cookie).toContain('sf-portal=mon-cabinet');
    expect(signInSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: '/connexion/mon-cabinet/continuer',
      errorCallbackURL: '/connexion/mon-cabinet',
    });
  });

  it('Microsoft : meme retour sur le portail', async () => {
    render(<LoginForm portal={{ slug: 'mon-cabinet' }} />);

    await userEvent.click(screen.getByRole('button', { name: /Microsoft/ }));

    expect(signInSocial).toHaveBeenCalledWith({
      provider: 'microsoft',
      callbackURL: '/connexion/mon-cabinet/continuer',
      errorCallbackURL: '/connexion/mon-cabinet',
    });
  });

  it('sur la page de SocialFlow, efface le cookie laisse par un portail visite avant (SuperAdmin, titulaire)', async () => {
    document.cookie = 'sf-portal=alicia-cabinet; path=/; max-age=600';
    render(<LoginForm />);

    // Des l'affichage : une connexion par mot de passe ou par code partirait sinon avec lui.
    expect(document.cookie).not.toContain('sf-portal=alicia-cabinet');

    document.cookie = 'sf-portal=alicia-cabinet; path=/; max-age=600';
    await userEvent.click(screen.getByRole('button', { name: /Google/ }));
    expect(document.cookie).not.toContain('sf-portal=alicia-cabinet');
  });

  it('sur la page de SocialFlow, Google ne pose aucun cookie de portail', async () => {
    render(<LoginForm />);

    await userEvent.click(screen.getByRole('button', { name: /Google/ }));

    expect(document.cookie).not.toContain('sf-portal');
    expect(signInSocial).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/bienvenue' });
  });
});
