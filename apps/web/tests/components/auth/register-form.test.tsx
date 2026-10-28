import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterForm } from '@/components/auth/register-form';

// Inscription d'un cabinet : champs, validations locales, envoi, Google et Microsoft.
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const signUpEmail = vi.fn();
const signInSocial = vi.fn();
vi.mock('@/lib/auth/auth-client', () => ({
  signUp: { email: (...a: unknown[]) => signUpEmail(...a) },
  signIn: { social: (...a: unknown[]) => signInSocial(...a) },
}));

beforeEach(() => {
  [push, refresh, signUpEmail, signInSocial].forEach((m) => m.mockReset());
  signUpEmail.mockResolvedValue({ error: null });
  signInSocial.mockResolvedValue({ error: null });
});

const rendre = () => render(<RegisterForm planId="pro" billingPeriod="yearly" />);

const remplir = async (mdp = 'MotDePasse123!', confirmation = mdp) => {
  await userEvent.type(screen.getByLabelText('Nom complet'), 'Marie Dupont');
  await userEvent.type(screen.getByLabelText('Nom du cabinet'), 'Cabinet Dupont');
  await userEvent.type(screen.getByLabelText('Email'), 'marie@cabinet.be');
  await userEvent.type(screen.getByLabelText('Mot de passe'), mdp);
  await userEvent.type(screen.getByLabelText('Confirmer le mot de passe'), confirmation);
};
const creer = () => userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));

describe('RegisterForm : champs', () => {
  it('demande cinq champs obligatoires, avec leurs indications', () => {
    rendre();

    const attendus: [string, string, string][] = [
      ['Nom complet', 'text', 'name'],
      ['Nom du cabinet', 'text', 'organization'],
      ['Email', 'email', 'email'],
      ['Mot de passe', 'password', 'new-password'],
      ['Confirmer le mot de passe', 'password', 'new-password'],
    ];
    for (const [nom, type, autocomplete] of attendus) {
      const champ = screen.getByLabelText(nom);
      expect(champ).toHaveAttribute('type', type);
      expect(champ).toHaveAttribute('autocomplete', autocomplete);
      expect(champ).toBeRequired();
    }
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('placeholder', '8 caractères minimum');
  });

  it('propose de se connecter si on a déjà un compte', () => {
    rendre();

    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login');
  });
});

describe('RegisterForm : validations', () => {
  it('refuse un mot de passe de moins de 8 caractères', async () => {
    rendre();
    await remplir('court');

    await creer();

    expect(screen.getByText('Le mot de passe doit contenir au moins 8 caractères.')).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('refuse deux mots de passe différents', async () => {
    rendre();
    await remplir('MotDePasse123!', 'AutreChose123!');

    await creer();

    expect(screen.getByText('Les mots de passe ne correspondent pas.')).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });
});

describe('RegisterForm : accessibilité', () => {
  it('relie l’erreur aux deux champs mot de passe', async () => {
    rendre();
    await remplir('MotDePasse123!', 'AutreChose123!');

    await creer();

    const erreur = screen.getByRole('alert');
    for (const nom of ['Mot de passe', 'Confirmer le mot de passe']) {
      const champ = screen.getByLabelText(nom);
      expect(champ).toHaveAttribute('aria-invalid', 'true');
      expect(champ).toHaveAttribute('aria-describedby', erreur.id);
    }
  });
});

describe('RegisterForm : envoi', () => {
  it('crée le compte puis ouvre /bienvenue avec le plan et la période', async () => {
    rendre();
    await remplir();

    await creer();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/bienvenue?plan=pro&billing=yearly'));
    expect(refresh).toHaveBeenCalled();
    expect(signUpEmail).toHaveBeenCalledWith({
      name: 'Marie Dupont',
      cabinetName: 'Cabinet Dupont',
      email: 'marie@cabinet.be',
      password: 'MotDePasse123!',
    });
  });

  it('explique un refus du serveur et laisse réessayer', async () => {
    signUpEmail.mockResolvedValue({ error: { code: 'USER_ALREADY_EXISTS' } });
    rendre();
    await remplir();

    await creer();

    expect(await screen.findByText('Un compte existe déjà avec cette adresse email.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer mon compte' })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('désactive « Créer mon compte » pendant l’envoi', async () => {
    let finir: (valeur: unknown) => void = () => {};
    signUpEmail.mockReturnValue(new Promise((resolve) => (finir = resolve)));
    rendre();
    await remplir();

    await creer();

    expect(screen.getByRole('button', { name: 'Créer mon compte' })).toBeDisabled();
    finir({ error: null });
    await waitFor(() => expect(push).toHaveBeenCalled());
  });
});

describe('RegisterForm : Google et Microsoft', () => {
  it.each([
    ['Google', 'google'],
    ['Microsoft', 'microsoft'],
  ])('%s : lance l’inscription avec le plan choisi', async (nom, provider) => {
    rendre();

    await userEvent.click(screen.getByRole('button', { name: new RegExp(nom) }));

    expect(signInSocial).toHaveBeenCalledWith({
      provider,
      callbackURL: '/bienvenue?plan=pro&billing=yearly',
      requestSignUp: true,
    });
  });

  it('pendant la redirection, le bouton Google est désactivé et Microsoft reste actif', async () => {
    signInSocial.mockReturnValue(new Promise(() => {}));
    rendre();

    await userEvent.click(screen.getByRole('button', { name: /Google/ }));

    expect(screen.getByRole('button', { name: /Google/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Microsoft/ })).toBeEnabled();
  });

  it('une erreur de Google est expliquée et le bouton redevient actif', async () => {
    signInSocial.mockResolvedValue({ error: { code: 'INVALID_PASSWORD' } });
    rendre();

    await userEvent.click(screen.getByRole('button', { name: /Google/ }));

    expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Google/ })).toBeEnabled();
  });

  it('une erreur de Microsoft est expliquée et le bouton redevient actif', async () => {
    signInSocial.mockResolvedValue({ error: { code: 'INVALID_PASSWORD' } });
    rendre();

    await userEvent.click(screen.getByRole('button', { name: /Microsoft/ }));

    expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Microsoft/ })).toBeEnabled();
  });
});
