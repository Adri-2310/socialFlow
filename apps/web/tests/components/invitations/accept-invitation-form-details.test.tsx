import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcceptInvitationForm } from '@/components/invitations/accept-invitation-form';

// Compléments au test de l'invitation : champs, validations, refus du serveur, copie du portail.
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  vi.unstubAllGlobals();
});

const reponse = (ok: boolean, corps: unknown) =>
  vi.fn().mockResolvedValue({ ok, json: async () => corps });

const rendre = () => render(<AcceptInvitationForm token="jeton-1" email="bruno@cabinet.be" />);

const remplir = async (mdp = 'MotDePasse123!', confirmation = mdp) => {
  await userEvent.type(screen.getByLabelText('Nom complet'), 'Bruno Test');
  await userEvent.type(screen.getByLabelText('Mot de passe'), mdp);
  await userEvent.type(screen.getByLabelText('Confirmer le mot de passe'), confirmation);
};
const creer = () => userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));

describe('AcceptInvitationForm : champs', () => {
  it('affiche l’adresse invitée, non modifiable', () => {
    rendre();

    const email = screen.getByLabelText('Email');
    expect(email).toHaveValue('bruno@cabinet.be');
    expect(email).toBeDisabled();
  });

  it('demande un nom et deux mots de passe obligatoires, avec leurs indications', () => {
    rendre();

    const nom = screen.getByLabelText('Nom complet');
    expect(nom).toHaveAttribute('autocomplete', 'name');
    expect(nom).toBeRequired();
    const mdp = screen.getByLabelText('Mot de passe');
    expect(mdp).toHaveAttribute('autocomplete', 'new-password');
    expect(mdp).toHaveAttribute('placeholder', '8 caractères minimum');
    expect(mdp).toBeRequired();
    expect(screen.getByLabelText('Confirmer le mot de passe')).toBeRequired();
  });
});

describe('AcceptInvitationForm : validations', () => {
  it('refuse un mot de passe de moins de 8 caractères', async () => {
    const fetchMock = reponse(true, {});
    vi.stubGlobal('fetch', fetchMock);
    rendre();
    await remplir('court');

    await creer();

    expect(screen.getByText('Le mot de passe doit contenir au moins 8 caractères.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse deux mots de passe différents', async () => {
    const fetchMock = reponse(true, {});
    vi.stubGlobal('fetch', fetchMock);
    rendre();
    await remplir('MotDePasse123!', 'AutreChose123!');

    await creer();

    expect(screen.getByText('Les mots de passe ne correspondent pas.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('AcceptInvitationForm : accessibilité', () => {
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

describe('AcceptInvitationForm : envoi', () => {
  it('envoie le jeton, le nom et le mot de passe', async () => {
    const fetchMock = reponse(true, { portalUrl: 'https://app.test/connexion/alicia' });
    vi.stubGlobal('fetch', fetchMock);
    rendre();
    await remplir();

    await creer();

    await screen.findByText('Votre compte est créé');
    expect(fetchMock).toHaveBeenCalledWith('/api/invitations/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'jeton-1', name: 'Bruno Test', password: 'MotDePasse123!' }),
    });
  });

  it('sans adresse de portail, ouvre directement le tableau de bord', async () => {
    vi.stubGlobal('fetch', reponse(true, { success: true }));
    rendre();
    await remplir();

    await creer();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(refresh).toHaveBeenCalled();
  });

  it.each([
    ['INVALID_TOKEN', 'Ce lien d’invitation n’est plus valable.'],
    ['EMAIL_ALREADY_USED', 'Un compte existe déjà avec cette adresse email. Connectez-vous.'],
    ['CABINET_READ_ONLY', 'Ce cabinet ne peut pas accueillir de nouveau compte pour le moment.'],
    ['PASSWORD_TOO_SHORT', 'Le mot de passe doit contenir au moins 8 caractères.'],
    ['INCONNU', 'Une erreur est survenue. Veuillez réessayer.'],
  ])('refus %s : explique le problème et laisse réessayer', async (code, message) => {
    vi.stubGlobal('fetch', reponse(false, { error: code }));
    rendre();
    await remplir();

    await creer();

    const erreur = await screen.findByText((contenu) => contenu.replace(/’/g, "'").includes(message.replace(/’/g, "'")));
    expect(erreur).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer mon compte' })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('désactive « Créer mon compte » pendant l’envoi', async () => {
    let finir: (valeur: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((resolve) => (finir = resolve))));
    rendre();
    await remplir();

    await creer();

    expect(screen.getByRole('button', { name: 'Créer mon compte' })).toBeDisabled();
    finir({ ok: true, json: async () => ({ portalUrl: 'https://app.test/connexion/alicia' }) });
    await screen.findByText('Votre compte est créé');
  });
});

describe('AcceptInvitationForm : adresse du portail', () => {
  async function versLePortail() {
    vi.stubGlobal('fetch', reponse(true, { portalUrl: 'https://app.test/connexion/alicia' }));
    rendre();
    await remplir();
    await creer();
    await screen.findByText('Votre compte est créé');
  }

  it('« Copier » met l’adresse dans le presse-papiers et annonce « Copié »', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await versLePortail();

    await userEvent.click(screen.getByRole('button', { name: 'Copier' }));

    expect(writeText).toHaveBeenCalledWith('https://app.test/connexion/alicia');
    expect(await screen.findByRole('button', { name: 'Copié' })).toBeInTheDocument();
  });

  it('un presse-papiers indisponible ne bloque rien', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('refusé'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await versLePortail();

    await userEvent.click(screen.getByRole('button', { name: 'Copier' }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Copier' })).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse du portail')).toBeInTheDocument();
  });
});
