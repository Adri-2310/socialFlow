import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/components/auth/login-form';

// Compléments au test de la connexion : champs, vérification en deux étapes, erreurs, fournisseurs.
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const signInEmail = vi.fn();
const signInSocial = vi.fn();
const verifyTotp = vi.fn();
const verifyBackupCode = vi.fn();
vi.mock('@/lib/auth/auth-client', () => ({
  signIn: {
    email: (...a: unknown[]) => signInEmail(...a),
    social: (...a: unknown[]) => signInSocial(...a),
  },
  twoFactor: {
    verifyTotp: (...a: unknown[]) => verifyTotp(...a),
    verifyBackupCode: (...a: unknown[]) => verifyBackupCode(...a),
  },
  authClient: { signIn: { magicLink: vi.fn(), emailOtp: vi.fn() }, emailOtp: { sendVerificationOtp: vi.fn() } },
}));

beforeEach(() => {
  [push, refresh, signInEmail, signInSocial, verifyTotp, verifyBackupCode].forEach((m) => m.mockReset());
  signInSocial.mockResolvedValue({ error: null });
  verifyTotp.mockResolvedValue({ error: null });
  verifyBackupCode.mockResolvedValue({ error: null });
  document.cookie = 'sf-portal=; path=/; max-age=0';
});

const remplir = async () => {
  await userEvent.type(screen.getByLabelText('Adresse email'), 'marie@client.be');
  await userEvent.type(screen.getByLabelText('Mot de passe'), 'MotDePasse123!');
};
const seConnecter = async () => {
  await remplir();
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
};

async function versLaDoubleAuthentification(props: React.ComponentProps<typeof LoginForm> = {}) {
  signInEmail.mockResolvedValue({ data: { twoFactorRedirect: true }, error: null });
  render(<LoginForm {...props} />);
  await seConnecter();
  await screen.findByText('Vérification en deux étapes');
}

describe('LoginForm : champs', () => {
  it('demande une adresse et un mot de passe obligatoires, avec leurs indications', () => {
    render(<LoginForm />);

    const email = screen.getByLabelText('Adresse email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(email).toBeRequired();
    const mdp = screen.getByLabelText('Mot de passe');
    expect(mdp).toHaveAttribute('type', 'password');
    expect(mdp).toHaveAttribute('autocomplete', 'current-password');
    expect(mdp).toBeRequired();
  });

  it('l’œil affiche puis masque le mot de passe', async () => {
    render(<LoginForm />);

    await userEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'Masquer le mot de passe' }));
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('type', 'password');
  });

  it('« Rester connecté » est coché par défaut, et décoché il est transmis', async () => {
    signInEmail.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm />);
    const case_ = screen.getByRole('checkbox', { name: 'Rester connecté' });
    expect(case_).toBeChecked();

    await userEvent.click(case_);
    expect(case_).not.toBeChecked();
    await seConnecter();

    expect(signInEmail).toHaveBeenCalledWith(
      { email: 'marie@client.be', password: 'MotDePasse123!', rememberMe: false },
      undefined,
    );
  });

  it('désactive « Se connecter » pendant l’envoi', async () => {
    let finir: (valeur: unknown) => void = () => {};
    signInEmail.mockReturnValue(new Promise((resolve) => (finir = resolve)));
    render(<LoginForm />);

    await seConnecter();

    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeDisabled();
    finir({ data: {}, error: null });
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });
});

describe('LoginForm : erreurs de connexion', () => {
  it('explique des identifiants refusés et laisse réessayer', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { code: 'INVALID_PASSWORD' } });
    render(<LoginForm />);

    await seConnecter();

    expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    ['CABINET_SUSPENDED', '/erreur-connexion?error=cabinet_suspended'],
    ['USER_SUSPENDED', '/erreur-connexion?error=user_suspended'],
    ['USER_SUSPENDED_BY_CABINET', '/erreur-connexion?error=user_suspended_by_cabinet'],
  ])('%s : renvoie vers la page d’erreur commune', async (code, destination) => {
    signInEmail.mockResolvedValue({ data: null, error: { code } });
    render(<LoginForm />);

    await seConnecter();

    await waitFor(() => expect(push).toHaveBeenCalledWith(destination));
  });
});

describe('LoginForm : vérification en deux étapes', () => {
  it('demande le code de l’application, puis ouvre /bienvenue', async () => {
    await versLaDoubleAuthentification();
    const champ = screen.getByLabelText('Code à 6 chiffres');
    expect(champ).toHaveAttribute('inputmode', 'numeric');
    expect(champ).toBeRequired();

    await userEvent.type(champ, '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/bienvenue'));
    expect(verifyTotp).toHaveBeenCalledWith({ code: '123456' }, undefined);
    expect(refresh).toHaveBeenCalled();
  });

  it('bascule vers un code de secours, et revient à l’application', async () => {
    await versLaDoubleAuthentification();

    await userEvent.click(screen.getByRole('button', { name: 'Utiliser un code de secours' }));
    expect(screen.getByLabelText('Code de secours')).toHaveAttribute('inputmode', 'text');
    expect(screen.getByText('Saisissez un de vos codes de secours.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Code de secours'), 'aaaa-1111');
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }));

    await waitFor(() => expect(verifyBackupCode).toHaveBeenCalledWith({ code: 'aaaa-1111' }, undefined));
    expect(verifyTotp).not.toHaveBeenCalled();
  });

  it('revenir à l’application d’authentification vide le champ', async () => {
    await versLaDoubleAuthentification();
    await userEvent.click(screen.getByRole('button', { name: 'Utiliser un code de secours' }));
    await userEvent.type(screen.getByLabelText('Code de secours'), 'abc');

    await userEvent.click(screen.getByRole('button', { name: "Utiliser l'application d'authentification" }));

    expect(screen.getByLabelText('Code à 6 chiffres')).toHaveValue('');
  });

  it('un code refusé est expliqué sans rediriger', async () => {
    verifyTotp.mockResolvedValue({ error: { code: 'INVALID_CODE' } });
    await versLaDoubleAuthentification();
    await userEvent.type(screen.getByLabelText('Code à 6 chiffres'), '000000');

    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }));

    expect(await screen.findByText('Code invalide. Réessayez.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('« Retour » ramène au formulaire de connexion', async () => {
    await versLaDoubleAuthentification();

    await userEvent.click(screen.getByRole('button', { name: 'Retour' }));

    expect(screen.getByLabelText('Adresse email')).toBeInTheDocument();
  });

  it('sur un portail, annonce le portail à la vérification et ouvre le tableau de bord', async () => {
    await versLaDoubleAuthentification({ portal: { slug: 'mon-cabinet' } });
    await userEvent.type(screen.getByLabelText('Code à 6 chiffres'), '123456');

    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(verifyTotp).toHaveBeenCalledWith({ code: '123456' }, { headers: { 'x-sf-portal': 'mon-cabinet' } });
  });

  it('désactive « Vérifier » pendant la vérification', async () => {
    let finir: (valeur: unknown) => void = () => {};
    verifyTotp.mockReturnValue(new Promise((resolve) => (finir = resolve)));
    await versLaDoubleAuthentification();
    await userEvent.type(screen.getByLabelText('Code à 6 chiffres'), '123456');

    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }));

    expect(screen.getByRole('button', { name: 'Vérifier' })).toBeDisabled();
    finir({ error: null });
    await waitFor(() => expect(push).toHaveBeenCalled());
  });
});

describe('LoginForm : Google, Microsoft et email', () => {
  it('une erreur de Google est expliquée et le bouton redevient actif', async () => {
    signInSocial.mockResolvedValue({ error: { code: 'INVALID_PASSWORD' } });
    render(<LoginForm />);

    await userEvent.click(screen.getByRole('button', { name: /Google/ }));

    expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Google/ })).toBeEnabled();
  });

  it('pendant la redirection, le bouton Google est désactivé', async () => {
    signInSocial.mockReturnValue(new Promise(() => {}));
    render(<LoginForm />);

    await userEvent.click(screen.getByRole('button', { name: /Google/ }));

    expect(screen.getByRole('button', { name: /Google/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Microsoft/ })).toBeEnabled();
  });

  it('une erreur de Microsoft est expliquée', async () => {
    signInSocial.mockResolvedValue({ error: { code: 'INVALID_PASSWORD' } });
    render(<LoginForm />);

    await userEvent.click(screen.getByRole('button', { name: /Microsoft/ }));

    expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Microsoft/ })).toBeEnabled();
  });

  it('« Email » passe à la connexion sans mot de passe, et le retour au mot de passe', async () => {
    render(<LoginForm />);
    expect(screen.getByText('ou avec votre e-mail')).toBeInTheDocument();

    // Nom accessible du bouton (le texte « Email » est masqué sous `sm`).
    await userEvent.click(screen.getByRole('button', { name: /par email/i }));

    expect(screen.getByRole('button', { name: 'Se connecter avec un mot de passe' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Google/ })).not.toBeInTheDocument();
    expect(screen.queryByText('ou avec votre e-mail')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Se connecter avec un mot de passe' }));

    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Google/ })).toBeInTheDocument();
  });
});
