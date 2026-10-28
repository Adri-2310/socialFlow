import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { UsersTable, type UserRow } from '@/components/admin/users-table';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/auth/account-retention';

// Compléments au test de la liste des utilisateurs (console SuperAdmin) : actions par état,
// erreurs, envoi en cours, annulations, résumé, tris et filtres.
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const FORMAT_DATE = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' });

const utilisateur = (surcharge: Partial<UserRow> = {}): UserRow => ({
  id: 'u1',
  name: 'Julien Lemaire',
  email: 'julien@cabinet.be',
  role: 'CABINET_RH',
  status: 'actif',
  cabinetName: 'Cabinet Lemaire',
  createdAt: '2026-01-10T00:00:00.000Z',
  deletedAt: null,
  ...surcharge,
});

const reponse = (status: number) => ({ ok: status < 400, status, json: async () => ({}) });
const ligne = (nom: string) => screen.getByRole('row', { name: new RegExp(nom) });

beforeEach(() => {
  refreshMock.mockReset();
  vi.unstubAllGlobals();
});

describe('UsersTable : actions selon l’état du compte', () => {
  it('actif : suspendre, révoquer les sessions, réinitialiser le mot de passe, archiver', () => {
    render(<UsersTable users={[utilisateur()]} />);
    const rangee = ligne('Julien Lemaire');

    expect(within(rangee).getByRole('button', { name: 'Suspendre' })).toBeEnabled();
    expect(within(rangee).getByRole('button', { name: 'Révoquer les sessions de Julien Lemaire' })).toBeEnabled();
    expect(
      within(rangee).getByRole('button', { name: 'Envoyer un lien de réinitialisation à Julien Lemaire' }),
    ).toBeEnabled();
    expect(within(rangee).getByRole('button', { name: 'Archiver Julien Lemaire' })).toBeEnabled();
    expect(within(rangee).queryByRole('button', { name: 'Réactiver' })).not.toBeInTheDocument();
  });

  it('suspendu : « Réactiver » à la place de « Suspendre »', () => {
    render(<UsersTable users={[utilisateur({ status: 'suspendu' })]} />);
    const rangee = ligne('Julien Lemaire');

    expect(within(rangee).getByRole('button', { name: 'Réactiver' })).toBeInTheDocument();
    expect(within(rangee).queryByRole('button', { name: 'Suspendre' })).not.toBeInTheDocument();
  });

  it('archivé : la date de purge tient compte du délai de conservation', () => {
    const supprime = '2026-08-01T00:00:00.000Z';
    render(<UsersTable users={[utilisateur({ deletedAt: supprime })]} />);

    const purge = new Date(new Date(supprime).getTime() + ACCOUNT_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    expect(screen.getByText(`Purge le ${FORMAT_DATE.format(purge)}`)).toBeInTheDocument();
  });

  it('cabinet absent : un tiret ; rôle inconnu : affiché tel quel', () => {
    render(<UsersTable users={[utilisateur({ cabinetName: null, role: 'NOUVEAU_ROLE' })]} />);
    const rangee = ligne('Julien Lemaire');

    expect(within(rangee).getByText('NOUVEAU_ROLE')).toBeInTheDocument();
    expect(within(rangee).getAllByText('—')).toHaveLength(1);
  });
});

describe('UsersTable : envoi en cours et erreurs', () => {
  it('désactive les boutons de la ligne pendant la réactivation', async () => {
    let finir: (valeur: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((resolve) => (finir = resolve))));
    render(<UsersTable users={[utilisateur({ status: 'suspendu' })]} />);
    const rangee = ligne('Julien Lemaire');

    fireEvent.click(within(rangee).getByRole('button', { name: 'Réactiver' }));

    await waitFor(() =>
      within(rangee)
        .getAllByRole('button')
        .forEach((bouton) => expect(bouton).toBeDisabled()),
    );
    finir(reponse(200));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('une réactivation refusée affiche l’erreur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse(500)));
    render(<UsersTable users={[utilisateur({ status: 'suspendu' })]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Réactiver' }));

    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('une suspension refusée affiche l’erreur et ferme la confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse(500)));
    render(<UsersTable users={[utilisateur()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suspendre' }));

    const suspendre = await screen.findAllByRole('button', { name: 'Suspendre' });
    fireEvent.click(suspendre[suspendre.length - 1]);

    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Suspendre cet utilisateur ?')).not.toBeInTheDocument());
  });

  it('une restauration refusée affiche l’erreur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse(500)));
    render(<UsersTable users={[utilisateur({ deletedAt: '2026-08-01T00:00:00.000Z' })]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }));

    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeInTheDocument();
  });

  it.each([
    ['Archiver Julien Lemaire', 'Archiver cet utilisateur ?'],
    ['Révoquer les sessions de Julien Lemaire', 'Révoquer les sessions ?'],
    ['Envoyer un lien de réinitialisation à Julien Lemaire', 'Envoyer un lien de réinitialisation ?'],
  ])('annuler la confirmation « %s » n’envoie rien', async (bouton, titre) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<UsersTable users={[utilisateur()]} />);
    fireEvent.click(screen.getByRole('button', { name: bouton }));
    expect(await screen.findByText(titre)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByText(titre)).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('le message de succès d’une action de support est annoncé, puis remplacé par une erreur', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reponse(200)).mockResolvedValueOnce(reponse(500));
    vi.stubGlobal('fetch', fetchMock);
    render(<UsersTable users={[utilisateur()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Révoquer les sessions de Julien Lemaire' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Révoquer' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Sessions de « Julien Lemaire » révoquées.');

    fireEvent.click(screen.getByRole('button', { name: 'Révoquer les sessions de Julien Lemaire' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Révoquer' }));

    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('UsersTable : résumé, tris et filtres', () => {
  it('résume le nombre d’utilisateurs, au singulier comme au pluriel', () => {
    const { unmount } = render(<UsersTable users={[utilisateur()]} />);
    expect(screen.getByText('1 utilisateur')).toBeInTheDocument();
    unmount();

    render(<UsersTable users={[utilisateur(), utilisateur({ id: 'u2', name: 'Sophie Delvaux' })]} />);
    expect(screen.getByText('2 utilisateurs')).toBeInTheDocument();
  });

  it('cherche aussi par adresse email', () => {
    render(<UsersTable users={[utilisateur(), utilisateur({ id: 'u2', name: 'Sophie Delvaux', email: 'sophie@fidu.be' })]} />);

    fireEvent.change(screen.getByPlaceholderText('Rechercher un nom ou un email…'), { target: { value: 'fidu' } });

    expect(screen.getByText('Sophie Delvaux')).toBeInTheDocument();
    expect(screen.queryByText('Julien Lemaire')).not.toBeInTheDocument();
  });

  it('propose les filtres de rôle et de statut', () => {
    render(<UsersTable users={[utilisateur()]} />);

    expect(
      within(screen.getByDisplayValue('Tous les rôles')).getAllByRole('option').map((o) => o.textContent),
    ).toEqual(['Tous les rôles', 'SuperAdmin', 'Cabinet RH', 'Gestionnaire RH', 'Entreprise cliente', 'Collaborateur']);
    expect(
      within(screen.getByDisplayValue('Tous les statuts')).getAllByRole('option').map((o) => o.textContent),
    ).toEqual(['Tous les statuts', 'Actif', 'Suspendu', 'Archivé']);
  });

  it('combine le filtre de rôle et celui de statut', () => {
    render(
      <UsersTable
        users={[
          utilisateur({ id: 'a', name: 'Actif RH' }),
          utilisateur({ id: 'b', name: 'Suspendu RH', status: 'suspendu' }),
          utilisateur({ id: 'c', name: 'Suspendu Gestionnaire', status: 'suspendu', role: 'GESTIONNAIRE_RH' }),
        ]}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('Tous les rôles'), { target: { value: 'CABINET_RH' } });
    fireEvent.change(screen.getByDisplayValue('Tous les statuts'), { target: { value: 'suspendu' } });

    expect(screen.getByText('Suspendu RH')).toBeInTheDocument();
    expect(screen.queryByText('Actif RH')).not.toBeInTheDocument();
    expect(screen.queryByText('Suspendu Gestionnaire')).not.toBeInTheDocument();
  });

  it('trie par email, par rôle et par cabinet', () => {
    render(
      <UsersTable
        users={[
          utilisateur({ id: 'a', name: 'Un', email: 'b@x.be', role: 'CABINET_RH', cabinetName: 'Cz' }),
          utilisateur({ id: 'b', name: 'Deux', email: 'c@x.be', role: 'COLLABORATEUR', cabinetName: 'Ay' }),
          utilisateur({ id: 'c', name: 'Trois', email: 'a@x.be', role: 'GESTIONNAIRE_RH', cabinetName: 'Bx' }),
        ]}
      />,
    );
    const noms = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((rangee) => within(rangee).getAllByRole('cell')[0].textContent);

    fireEvent.click(screen.getByRole('button', { name: 'Email' }));
    expect(noms()).toEqual(['Trois', 'Un', 'Deux']);

    fireEvent.click(screen.getByRole('button', { name: 'Rôle' }));
    expect(noms()).toEqual(['Un', 'Deux', 'Trois']);

    fireEvent.click(screen.getByRole('button', { name: 'Cabinet' }));
    expect(noms()).toEqual(['Deux', 'Trois', 'Un']);
  });

  it('trie par date de création en commençant par la plus récente', () => {
    render(
      <UsersTable
        users={[
          utilisateur({ id: 'a', name: 'Ancien', createdAt: '2025-01-01T00:00:00.000Z' }),
          utilisateur({ id: 'b', name: 'Récent', createdAt: '2026-06-01T00:00:00.000Z' }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Créé le' }));

    expect(within(screen.getAllByRole('row')[1]).getByText('Récent')).toBeInTheDocument();
  });

  it('une nouvelle recherche revient à la première page', () => {
    const beaucoup = Array.from({ length: 30 }, (_, i) =>
      utilisateur({ id: `u${i}`, name: `Utilisateur ${String(i).padStart(2, '0')}` }),
    );
    render(<UsersTable users={beaucoup} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByText(/page 2 sur 2/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Rechercher un nom ou un email…'), {
      target: { value: 'Utilisateur' },
    });

    expect(screen.getByText(/page 1 sur 2/)).toBeInTheDocument();
  });
});
