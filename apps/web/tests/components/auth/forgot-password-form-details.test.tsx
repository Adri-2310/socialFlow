import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

// Compléments au test du portail : champ, envoi, écran de confirmation et erreurs.
const requestPasswordReset = vi.fn();
vi.mock('@/lib/auth/auth-client', () => ({
  authClient: { requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...a) },
}));

beforeEach(() => {
  requestPasswordReset.mockReset().mockResolvedValue({ error: null });
});

const demander = async () => {
  await userEvent.type(screen.getByLabelText('Adresse email'), 'marie@client.be');
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer le lien de réinitialisation' }));
};

describe('ForgotPasswordForm : saisie', () => {
  it('demande une adresse email obligatoire, avec ses indications', () => {
    render(<ForgotPasswordForm />);

    const champ = screen.getByLabelText('Adresse email');
    expect(champ).toHaveAttribute('type', 'email');
    expect(champ).toHaveAttribute('autocomplete', 'email');
    expect(champ).toHaveAttribute('placeholder', 'prenom@cabinet.be');
    expect(champ).toBeRequired();
  });

  it('propose un retour à la connexion', () => {
    render(<ForgotPasswordForm />);

    expect(screen.getByRole('link', { name: 'Retour à la connexion' })).toHaveAttribute('href', '/login');
  });
});

describe('ForgotPasswordForm : envoi', () => {
  it('envoie l’adresse avec le lien de retour, puis annonce la boîte mail', async () => {
    render(<ForgotPasswordForm />);

    await demander();

    expect(await screen.findByText('Vérifiez votre boîte mail')).toBeInTheDocument();
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: 'marie@client.be',
      redirectTo: '/reinitialiser-mot-de-passe',
    });
    expect(screen.getByText('marie@client.be')).toBeInTheDocument();
    expect(screen.getByText(/valable 1 heure/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Adresse email')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour à la connexion' })).toBeInTheDocument();
  });

  it('explique un refus du serveur et laisse réessayer', async () => {
    requestPasswordReset.mockResolvedValue({ error: { code: 'INVALID_EMAIL' } });
    render(<ForgotPasswordForm />);

    await demander();

    expect(await screen.findByText('Adresse email invalide.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer le lien de réinitialisation' })).toBeEnabled();
    expect(screen.getByLabelText('Adresse email')).toHaveValue('marie@client.be');
  });

  it('désactive le bouton pendant l’envoi', async () => {
    let finir: (valeur: unknown) => void = () => {};
    requestPasswordReset.mockReturnValue(new Promise((resolve) => (finir = resolve)));
    render(<ForgotPasswordForm />);

    await demander();

    expect(screen.getByRole('button', { name: 'Envoyer le lien de réinitialisation' })).toBeDisabled();
    finir({ error: null });
    await screen.findByText('Vérifiez votre boîte mail');
  });
});
