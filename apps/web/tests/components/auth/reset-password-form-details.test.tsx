import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

// Compléments au test du portail : validations, jeton, œil, succès et erreurs.
const push = vi.fn();
const refresh = vi.fn();
let search = 'token=abc';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(search),
}));

const resetPassword = vi.fn();
vi.mock('@/lib/auth/auth-client', () => ({
  authClient: { resetPassword: (...a: unknown[]) => resetPassword(...a) },
}));

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  resetPassword.mockReset().mockResolvedValue({ error: null });
  search = 'token=abc';
});

const remplir = async (mdp: string, confirmation = mdp) => {
  await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), mdp);
  await userEvent.type(screen.getByLabelText('Confirmer le mot de passe'), confirmation);
};
const valider = () => userEvent.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }));

describe('ResetPasswordForm : champs', () => {
  it('demande deux mots de passe obligatoires, masqués par défaut', () => {
    render(<ResetPasswordForm />);

    const nouveau = screen.getByLabelText('Nouveau mot de passe');
    expect(nouveau).toHaveAttribute('type', 'password');
    expect(nouveau).toHaveAttribute('autocomplete', 'new-password');
    expect(nouveau).toHaveAttribute('placeholder', '8 caractères minimum');
    expect(nouveau).toBeRequired();
    const confirmation = screen.getByLabelText('Confirmer le mot de passe');
    expect(confirmation).toHaveAttribute('type', 'password');
    expect(confirmation).toBeRequired();
  });

  it('l’œil affiche puis masque les deux champs à la fois', async () => {
    render(<ResetPasswordForm />);

    await userEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Confirmer le mot de passe')).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'Masquer le mot de passe' }));
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirmer le mot de passe')).toHaveAttribute('type', 'password');
  });
});

describe('ResetPasswordForm : validations', () => {
  it('refuse un mot de passe de moins de 8 caractères', async () => {
    render(<ResetPasswordForm />);
    await remplir('court');

    await valider();

    expect(screen.getByText('Le mot de passe doit contenir au moins 8 caractères.')).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('refuse deux mots de passe différents', async () => {
    render(<ResetPasswordForm />);
    await remplir('MotDePasse123!', 'AutreChose123!');

    await valider();

    expect(screen.getByText('Les mots de passe ne correspondent pas.')).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('relie l’erreur aux deux champs pour les lecteurs d’écran', async () => {
    render(<ResetPasswordForm />);
    await remplir('MotDePasse123!', 'AutreChose123!');

    await valider();

    const erreur = screen.getByRole('alert');
    for (const nom of ['Nouveau mot de passe', 'Confirmer le mot de passe']) {
      const champ = screen.getByLabelText(nom);
      expect(champ).toHaveAttribute('aria-invalid', 'true');
      expect(champ).toHaveAttribute('aria-describedby', erreur.id);
    }
  });

  it('sans jeton dans l’adresse, le bouton est désactivé', () => {
    search = '';
    render(<ResetPasswordForm />);

    expect(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' })).toBeDisabled();
  });

  it('affiche l’erreur transmise par le lien (?error=)', () => {
    search = 'error=TOKEN_EXPIRED';
    render(<ResetPasswordForm />);

    expect(screen.getByText('Ce lien a expiré. Recommencez la demande.')).toBeInTheDocument();
  });
});

describe('ResetPasswordForm : envoi', () => {
  it('envoie le nouveau mot de passe avec le jeton, puis annonce le succès', async () => {
    render(<ResetPasswordForm />);
    await remplir('MotDePasse123!');

    await valider();

    expect(await screen.findByText('Mot de passe mis à jour')).toBeInTheDocument();
    expect(resetPassword).toHaveBeenCalledWith({ newPassword: 'MotDePasse123!', token: 'abc' });
    expect(screen.queryByLabelText('Nouveau mot de passe')).not.toBeInTheDocument();
  });

  it('« Se connecter » ramène à la connexion et rafraîchit', async () => {
    render(<ResetPasswordForm />);
    await remplir('MotDePasse123!');
    await valider();

    await userEvent.click(await screen.findByRole('button', { name: 'Se connecter' }));

    expect(push).toHaveBeenCalledWith('/login');
    expect(refresh).toHaveBeenCalled();
  });

  it('explique un refus du serveur et laisse réessayer', async () => {
    resetPassword.mockResolvedValue({ error: { code: 'INVALID_TOKEN' } });
    render(<ResetPasswordForm />);
    await remplir('MotDePasse123!');

    await valider();

    expect(await screen.findByText(/invalide ou a déjà été utilisé/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' })).toBeEnabled();
  });

  it('désactive le bouton pendant l’envoi', async () => {
    let finir: (valeur: unknown) => void = () => {};
    resetPassword.mockReturnValue(new Promise((resolve) => (finir = resolve)));
    render(<ResetPasswordForm />);
    await remplir('MotDePasse123!');

    await valider();

    expect(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' })).toBeDisabled();
    finir({ error: null });
    await waitFor(() => expect(screen.getByText('Mot de passe mis à jour')).toBeInTheDocument());
  });
});
