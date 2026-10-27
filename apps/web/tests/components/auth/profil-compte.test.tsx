import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountSettings } from '@/components/auth/account-settings';
import { DeleteAccount } from '@/components/auth/delete-account';

// Informations du compte (nom, email, mot de passe) et suppression du compte, page « Mon profil ».
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const listAccounts = vi.fn();
const updateUser = vi.fn();
const changeEmail = vi.fn();
const sendVerificationEmail = vi.fn();
const changePassword = vi.fn();
const deleteUser = vi.fn();

vi.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    listAccounts: (...a: unknown[]) => listAccounts(...a),
    updateUser: (...a: unknown[]) => updateUser(...a),
    changeEmail: (...a: unknown[]) => changeEmail(...a),
    sendVerificationEmail: (...a: unknown[]) => sendVerificationEmail(...a),
    changePassword: (...a: unknown[]) => changePassword(...a),
    deleteUser: (...a: unknown[]) => deleteUser(...a),
  },
}));

const AVEC_MOT_DE_PASSE = { data: [{ providerId: 'credential' }] };
const SANS_MOT_DE_PASSE = { data: [{ providerId: 'google' }] };

beforeEach(() => {
  [refresh, listAccounts, updateUser, changeEmail, sendVerificationEmail, changePassword, deleteUser]
    .forEach((m) => m.mockReset());
  listAccounts.mockResolvedValue(AVEC_MOT_DE_PASSE);
});

describe('AccountSettings', () => {
  const rendre = (props: Partial<React.ComponentProps<typeof AccountSettings>> = {}) =>
    render(
      <AccountSettings name="Alicia Martin" email="alicia@test.com" emailVerified {...props} />,
    );

  // Le formulaire ouvert, ses boutons-icônes (valider, annuler) n'ayant pas de nom : on les
  // retrouve par leur type et leur position.
  const valider = (formulaire: HTMLElement) =>
    formulaire.querySelector('button[type="submit"]') as HTMLButtonElement;
  const annuler = (formulaire: HTMLElement) =>
    formulaire.querySelectorAll('button[type="button"]')[0] as HTMLButtonElement;
  const formulaireDe = (champ: HTMLElement) => champ.closest('form') as HTMLFormElement;
  const modifier = (rang: number) => screen.getAllByRole('button', { name: 'Modifier' })[rang];

  it('affiche le nom et l’adresse email, avec « Modifier » pour chacun', async () => {
    rendre();

    expect(screen.getByText('Alicia Martin')).toBeInTheDocument();
    expect(screen.getByText('alicia@test.com')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Modifier' })).toHaveLength(3));
  });

  it('sans mot de passe (connexion Google), ne propose pas de le modifier', async () => {
    listAccounts.mockResolvedValue(SANS_MOT_DE_PASSE);
    rendre();

    await waitFor(() => expect(listAccounts).toHaveBeenCalled());
    expect(screen.getAllByRole('button', { name: 'Modifier' })).toHaveLength(2);
    expect(screen.queryByText('Mot de passe')).not.toBeInTheDocument();
  });

  describe('nom', () => {
    it('enregistre le nouveau nom, ferme le formulaire et rafraîchit', async () => {
      updateUser.mockResolvedValue({ error: null });
      rendre();
      await userEvent.click(modifier(0));
      const champ = screen.getByLabelText('Nom');
      expect(champ).toHaveValue('Alicia Martin');

      await userEvent.clear(champ);
      await userEvent.type(champ, 'Alicia Dupont');
      await userEvent.click(valider(formulaireDe(champ)));

      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(updateUser).toHaveBeenCalledWith({ name: 'Alicia Dupont' });
      expect(screen.queryByLabelText('Nom')).not.toBeInTheDocument();
    });

    it('annuler restaure le nom et n’envoie rien', async () => {
      rendre();
      await userEvent.click(modifier(0));
      const champ = screen.getByLabelText('Nom');
      await userEvent.type(champ, ' modifié');

      await userEvent.click(annuler(formulaireDe(champ)));

      expect(screen.queryByLabelText('Nom')).not.toBeInTheDocument();
      expect(updateUser).not.toHaveBeenCalled();
      await userEvent.click(modifier(0));
      expect(screen.getByLabelText('Nom')).toHaveValue('Alicia Martin');
    });

    it('explique un refus du serveur', async () => {
      updateUser.mockResolvedValue({ error: { code: 'INVALID_PASSWORD' } });
      rendre();
      await userEvent.click(modifier(0));

      await userEvent.click(valider(formulaireDe(screen.getByLabelText('Nom'))));

      expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe('email', () => {
    it('envoie la demande de changement et annonce l’email de confirmation', async () => {
      changeEmail.mockResolvedValue({ error: null });
      rendre();
      await userEvent.click(modifier(1));
      const champ = screen.getByLabelText('Nouvelle adresse email');
      expect(champ).toHaveAttribute('type', 'email');
      expect(champ).toHaveAttribute('placeholder', 'alicia@test.com');

      await userEvent.type(champ, 'nouvelle@test.com');
      await userEvent.click(valider(formulaireDe(champ)));

      expect(await screen.findByText(/Un email de confirmation a été envoyé/)).toBeInTheDocument();
      expect(screen.getByText('nouvelle@test.com')).toBeInTheDocument();
      expect(changeEmail).toHaveBeenCalledWith({
        newEmail: 'nouvelle@test.com',
        callbackURL: '/dashboard',
      });

      await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
      expect(screen.queryByText(/Un email de confirmation a été envoyé/)).not.toBeInTheDocument();
    });

    it('explique un refus du serveur', async () => {
      changeEmail.mockResolvedValue({ error: { code: 'INVALID_PASSWORD' } });
      rendre();
      await userEvent.click(modifier(1));
      const champ = screen.getByLabelText('Nouvelle adresse email');
      await userEvent.type(champ, 'nouvelle@test.com');

      await userEvent.click(valider(formulaireDe(champ)));

      expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
    });

    it('adresse vérifiée : aucun avertissement', () => {
      rendre();

      expect(screen.queryByText('Email non vérifié.')).not.toBeInTheDocument();
    });

    it('adresse non vérifiée : avertit et propose de renvoyer le message', async () => {
      sendVerificationEmail.mockResolvedValue({ error: null });
      rendre({ emailVerified: false });
      expect(screen.getByText('Email non vérifié.')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Renvoyer' }));

      expect(await screen.findByText('Email de vérification renvoyé.')).toBeInTheDocument();
      expect(sendVerificationEmail).toHaveBeenCalledWith({
        email: 'alicia@test.com',
        callbackURL: '/dashboard',
      });
      expect(screen.queryByRole('button', { name: 'Renvoyer' })).not.toBeInTheDocument();
    });

    it('explique l’échec du renvoi', async () => {
      sendVerificationEmail.mockResolvedValue({ error: { code: 'INVALID_PASSWORD' } });
      rendre({ emailVerified: false });

      await userEvent.click(screen.getByRole('button', { name: 'Renvoyer' }));

      expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Renvoyer' })).toBeEnabled();
    });
  });

  describe('mot de passe', () => {
    const ouvrir = async () => {
      rendre();
      await waitFor(() => expect(screen.getAllByRole('button', { name: 'Modifier' })).toHaveLength(3));
      await userEvent.click(modifier(2));
    };

    it('change le mot de passe, révoque les autres sessions et rafraîchit', async () => {
      changePassword.mockResolvedValue({ error: null });
      await ouvrir();
      await userEvent.type(screen.getByLabelText('Mot de passe actuel'), 'Ancien123!');
      await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), 'Nouveau123!');

      await userEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }));

      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'Ancien123!',
        newPassword: 'Nouveau123!',
        revokeOtherSessions: true,
      });
      expect(screen.queryByLabelText('Mot de passe actuel')).not.toBeInTheDocument();
    });

    it('refuse moins de 8 caractères sans appeler le serveur', async () => {
      await ouvrir();
      await userEvent.type(screen.getByLabelText('Mot de passe actuel'), 'Ancien123!');
      await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), 'court');

      await userEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }));

      expect(
        screen.getByText('Le nouveau mot de passe doit contenir au moins 8 caractères.'),
      ).toBeInTheDocument();
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('l’œil affiche et masque les deux champs', async () => {
      await ouvrir();
      expect(screen.getByLabelText('Mot de passe actuel')).toHaveAttribute('type', 'password');

      await userEvent.click(screen.getByRole('button', { name: 'Afficher les mots de passe' }));
      expect(screen.getByLabelText('Mot de passe actuel')).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute('type', 'text');

      await userEvent.click(screen.getByRole('button', { name: 'Masquer les mots de passe' }));
      expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute('type', 'password');
    });

    it('explique un mot de passe actuel refusé', async () => {
      changePassword.mockResolvedValue({ error: { code: 'INVALID_PASSWORD' } });
      await ouvrir();
      await userEvent.type(screen.getByLabelText('Mot de passe actuel'), 'faux');
      await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), 'Nouveau123!');

      await userEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }));

      expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('« Annuler » ferme le formulaire sans rien envoyer', async () => {
      await ouvrir();

      await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

      expect(screen.queryByLabelText('Mot de passe actuel')).not.toBeInTheDocument();
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('désactive « Mettre à jour » pendant l’envoi', async () => {
      let finish: (value: unknown) => void = () => {};
      changePassword.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      await ouvrir();
      await userEvent.type(screen.getByLabelText('Mot de passe actuel'), 'Ancien123!');
      await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), 'Nouveau123!');

      await userEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }));

      expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeDisabled();
      finish({ error: null });
      await waitFor(() => expect(refresh).toHaveBeenCalled());
    });
  });

  it('un seul formulaire est ouvert à la fois', async () => {
    rendre();
    await userEvent.click(modifier(0));
    expect(screen.getByLabelText('Nom')).toBeInTheDocument();

    await userEvent.click(modifier(0));

    expect(screen.queryByLabelText('Nom')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nouvelle adresse email')).toBeInTheDocument();
  });
});

describe('DeleteAccount : suppression du compte', () => {
  const ouvrir = async () => {
    render(<DeleteAccount />);
    const bouton = screen.getByRole('button', { name: 'Supprimer' });
    await waitFor(() => expect(bouton).toBeEnabled());
    await userEvent.click(bouton);
  };

  it('le bouton attend de savoir si le compte a un mot de passe', async () => {
    let finish: (value: unknown) => void = () => {};
    listAccounts.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<DeleteAccount />);

    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeDisabled();
    finish(AVEC_MOT_DE_PASSE);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Supprimer' })).toBeEnabled());
  });

  it('avec mot de passe : le demande, envoie, puis annonce l’email de confirmation', async () => {
    deleteUser.mockResolvedValue({ error: null });
    await ouvrir();
    expect(screen.getByText('Confirmer la suppression de votre compte')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Confirmez votre mot de passe'), 'Secret123!');

    await userEvent.click(
      screen.getByRole('button', { name: "Recevoir l'email de confirmation" }),
    );

    expect(await screen.findByText('Vérifiez votre boîte mail')).toBeInTheDocument();
    expect(deleteUser).toHaveBeenCalledWith({
      password: 'Secret123!',
      callbackURL: '/compte-supprime',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
  });

  it('sans mot de passe (Google) : pas de champ, l’email de confirmation suffit', async () => {
    listAccounts.mockResolvedValue(SANS_MOT_DE_PASSE);
    deleteUser.mockResolvedValue({ error: null });
    await ouvrir();
    expect(screen.queryByLabelText('Confirmez votre mot de passe')).not.toBeInTheDocument();
    expect(screen.getByText(/Votre compte n.a pas de mot de passe/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: "Recevoir l'email de confirmation" }),
    );

    expect(await screen.findByText('Vérifiez votre boîte mail')).toBeInTheDocument();
    expect(deleteUser).toHaveBeenCalledWith({ callbackURL: '/compte-supprime' });
  });

  it('explique un mot de passe refusé et laisse réessayer', async () => {
    deleteUser.mockResolvedValue({ error: { code: 'INVALID_PASSWORD' } });
    await ouvrir();
    await userEvent.type(screen.getByLabelText('Confirmez votre mot de passe'), 'faux');

    await userEvent.click(
      screen.getByRole('button', { name: "Recevoir l'email de confirmation" }),
    );

    expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: "Recevoir l'email de confirmation" }),
    ).toBeEnabled();
  });

  it('« Annuler » revient au bouton sans rien envoyer', async () => {
    await ouvrir();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('désactive l’envoi pendant la requête', async () => {
    let finish: (value: unknown) => void = () => {};
    deleteUser.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await ouvrir();
    await userEvent.type(screen.getByLabelText('Confirmez votre mot de passe'), 'Secret123!');

    await userEvent.click(
      screen.getByRole('button', { name: "Recevoir l'email de confirmation" }),
    );

    expect(
      screen.getByRole('button', { name: "Recevoir l'email de confirmation" }),
    ).toBeDisabled();
    finish({ error: null });
    await screen.findByText('Vérifiez votre boîte mail');
  });
});

