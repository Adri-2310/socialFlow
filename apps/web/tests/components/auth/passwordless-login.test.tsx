import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordlessLogin } from '@/components/auth/passwordless-login';
import { PORTAL_HEADER } from '@/lib/portal/portal-slug';

// Connexion sans mot de passe : lien magique, ou code à 6 chiffres reçu par email (D76 pour le portail).
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const magicLink = vi.fn();
const emailOtp = vi.fn();
const sendVerificationOtp = vi.fn();
vi.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    signIn: {
      magicLink: (...a: unknown[]) => magicLink(...a),
      emailOtp: (...a: unknown[]) => emailOtp(...a),
    },
    emailOtp: { sendVerificationOtp: (...a: unknown[]) => sendVerificationOtp(...a) },
  },
}));

const onBack = vi.fn();

beforeEach(() => {
  [push, refresh, magicLink, emailOtp, sendVerificationOtp, onBack].forEach((m) => m.mockReset());
  magicLink.mockResolvedValue({ error: null });
  sendVerificationOtp.mockResolvedValue({ error: null });
  emailOtp.mockResolvedValue({ error: null });
});

const rendre = (portal?: { slug: string }) =>
  render(<PasswordlessLogin onBack={onBack} portal={portal} />);

const saisirEmail = () => userEvent.type(screen.getByLabelText('Adresse email'), 'marie@client.be');

async function allerAuCode() {
  await saisirEmail();
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir un code à la place' }));
  await screen.findByLabelText('Code à 6 chiffres');
}

describe('PasswordlessLogin : saisie de l’adresse', () => {
  it('demande une adresse email obligatoire', () => {
    rendre();

    const champ = screen.getByLabelText('Adresse email');
    expect(champ).toHaveAttribute('type', 'email');
    expect(champ).toHaveAttribute('autocomplete', 'email');
    expect(champ).toHaveAttribute('placeholder', 'prenom@cabinet.be');
    expect(champ).toBeRequired();
  });

  it('« Se connecter avec un mot de passe » revient au formulaire principal', async () => {
    rendre();

    await userEvent.click(screen.getByRole('button', { name: 'Se connecter avec un mot de passe' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('le code par email n’est proposé qu’une fois l’adresse saisie', async () => {
    rendre();
    expect(screen.getByRole('button', { name: 'Recevoir un code à la place' })).toBeDisabled();

    await saisirEmail();

    expect(screen.getByRole('button', { name: 'Recevoir un code à la place' })).toBeEnabled();
  });

  it('envoie un lien magique de retour sur /bienvenue, puis annonce l’email', async () => {
    rendre();
    await saisirEmail();

    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un lien de connexion' }));

    expect(await screen.findByText('Vérifiez votre boîte mail')).toBeInTheDocument();
    expect(magicLink).toHaveBeenCalledWith({ email: 'marie@client.be', callbackURL: '/bienvenue' });
    expect(screen.getByText('marie@client.be')).toBeInTheDocument();
    expect(screen.getByText(/valable 5 minutes/)).toBeInTheDocument();
  });

  it('sur un portail, le lien revient sur la page « continuer » du portail', async () => {
    rendre({ slug: 'alicia-cabinet' });
    await saisirEmail();

    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un lien de connexion' }));

    await waitFor(() =>
      expect(magicLink).toHaveBeenCalledWith({
        email: 'marie@client.be',
        callbackURL: '/connexion/alicia-cabinet/continuer',
      }),
    );
  });

  it('explique un refus du serveur et reste sur la saisie', async () => {
    magicLink.mockResolvedValue({ error: { code: 'INVALID_CODE' } });
    rendre();
    await saisirEmail();

    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un lien de connexion' }));

    expect(await screen.findByText('Code invalide. Réessayez.')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse email')).toBeInTheDocument();
  });

  it('désactive les actions pendant l’envoi du lien', async () => {
    let finir: (valeur: unknown) => void = () => {};
    magicLink.mockReturnValue(new Promise((resolve) => (finir = resolve)));
    rendre();
    await saisirEmail();

    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un lien de connexion' }));

    expect(screen.getByRole('button', { name: 'Recevoir un lien de connexion' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Recevoir un code à la place' })).toBeDisabled();
    finir({ error: null });
    await screen.findByText('Vérifiez votre boîte mail');
  });
});

describe('PasswordlessLogin : lien envoyé', () => {
  async function versLienEnvoye() {
    rendre();
    await saisirEmail();
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un lien de connexion' }));
    await screen.findByText('Vérifiez votre boîte mail');
  }

  it('propose un code à la place, puis affiche le champ du code', async () => {
    await versLienEnvoye();

    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un code à la place' }));

    expect(await screen.findByLabelText('Code à 6 chiffres')).toBeInTheDocument();
    expect(sendVerificationOtp).toHaveBeenCalledWith({ email: 'marie@client.be', type: 'sign-in' });
  });

  it('un échec d’envoi du code est expliqué sans quitter l’écran', async () => {
    sendVerificationOtp.mockResolvedValue({ error: { code: 'INVALID_CODE' } });
    await versLienEnvoye();

    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un code à la place' }));

    expect(await screen.findByText('Code invalide. Réessayez.')).toBeInTheDocument();
    expect(screen.getByText('Vérifiez votre boîte mail')).toBeInTheDocument();
  });

  it('« Retour » revient à la saisie, avec l’adresse déjà tapée', async () => {
    await versLienEnvoye();

    await userEvent.click(screen.getByRole('button', { name: 'Retour' }));

    expect(screen.getByLabelText('Adresse email')).toHaveValue('marie@client.be');
  });
});

describe('PasswordlessLogin : code à 6 chiffres', () => {
  it('demande un code numérique obligatoire et rappelle l’adresse', async () => {
    rendre();
    await allerAuCode();

    const champ = screen.getByLabelText('Code à 6 chiffres');
    expect(champ).toHaveAttribute('inputmode', 'numeric');
    expect(champ).toHaveAttribute('autocomplete', 'one-time-code');
    expect(champ).toBeRequired();
    expect(screen.getByText(/Saisissez le code envoyé à marie@client.be/)).toBeInTheDocument();
  });

  it('vérifie le code, ouvre /bienvenue et rafraîchit', async () => {
    rendre();
    await allerAuCode();
    await userEvent.type(screen.getByLabelText('Code à 6 chiffres'), '123456');

    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/bienvenue'));
    expect(refresh).toHaveBeenCalled();
    expect(emailOtp).toHaveBeenCalledWith({ email: 'marie@client.be', otp: '123456' }, undefined);
  });

  it('sur un portail, annonce le portail et ouvre le tableau de bord', async () => {
    rendre({ slug: 'alicia-cabinet' });
    await allerAuCode();
    await userEvent.type(screen.getByLabelText('Code à 6 chiffres'), '123456');

    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(emailOtp).toHaveBeenCalledWith(
      { email: 'marie@client.be', otp: '123456' },
      { headers: { [PORTAL_HEADER]: 'alicia-cabinet' } },
    );
  });

  it('un code refusé est expliqué et ne redirige pas', async () => {
    emailOtp.mockResolvedValue({ error: { code: 'INVALID_CODE' } });
    rendre();
    await allerAuCode();
    await userEvent.type(screen.getByLabelText('Code à 6 chiffres'), '000000');

    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }));

    expect(await screen.findByText('Code invalide. Réessayez.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('« Renvoyer le code » en envoie un nouveau', async () => {
    rendre();
    await allerAuCode();
    sendVerificationOtp.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Renvoyer le code' }));

    await waitFor(() =>
      expect(sendVerificationOtp).toHaveBeenCalledWith({ email: 'marie@client.be', type: 'sign-in' }),
    );
  });

  it('« Retour » revient à la saisie de l’adresse', async () => {
    rendre();
    await allerAuCode();

    await userEvent.click(screen.getByRole('button', { name: 'Retour' }));

    expect(screen.getByLabelText('Adresse email')).toHaveValue('marie@client.be');
  });

  it('désactive « Vérifier » pendant la vérification', async () => {
    let finir: (valeur: unknown) => void = () => {};
    emailOtp.mockReturnValue(new Promise((resolve) => (finir = resolve)));
    rendre();
    await allerAuCode();
    await userEvent.type(screen.getByLabelText('Code à 6 chiffres'), '123456');

    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }));

    expect(screen.getByRole('button', { name: 'Vérifier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Renvoyer le code' })).toBeDisabled();
    finir({ error: null });
    await waitFor(() => expect(push).toHaveBeenCalled());
  });
});
