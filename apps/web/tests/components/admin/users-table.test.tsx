import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { UsersTable, type UserRow } from '@/components/admin/users-table';

const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' });

const USERS: UserRow[] = [
  {
    id: '1',
    name: 'Julien Lemaire',
    email: 'julien.lemaire@cabinetlemaire.be',
    role: 'CABINET_RH',
    status: 'actif',
    cabinetName: 'Cabinet Lemaire & Fils',
    createdAt: '2026-01-10T00:00:00.000Z',
    deletedAt: null,
  },
  {
    id: '2',
    name: 'Sophie Delvaux',
    email: 'sophie.delvaux@fiduciairedelvaux.be',
    role: 'GESTIONNAIRE_RH',
    status: 'suspendu',
    cabinetName: 'Fiduciaire Delvaux',
    createdAt: '2026-03-05T00:00:00.000Z',
    deletedAt: null,
  },
  {
    id: '3',
    name: 'Adrien Mertens',
    email: 'warse@live.fr',
    role: 'SUPER_ADMIN',
    status: 'actif',
    cabinetName: null,
    createdAt: '2025-12-01T00:00:00.000Z',
    deletedAt: null,
  },
];

beforeEach(() => {
  refreshMock.mockReset();
  vi.unstubAllGlobals();
});

describe('UsersTable - affichage et recherche', () => {
  it('affiche tous les utilisateurs avec leur role et cabinet', () => {
    render(<UsersTable users={USERS} />);
    const rows = screen.getAllByRole('row').slice(1);

    expect(within(rows[0]).getByText('Julien Lemaire')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Cabinet Lemaire & Fils')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Gestionnaire RH')).toBeInTheDocument();
    expect(within(rows[2]).getByText('SuperAdmin')).toBeInTheDocument();
    // Le SuperAdmin n'a pas de cabinet.
    expect(within(rows[2]).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('filtre par nom ou email via la recherche', () => {
    render(<UsersTable users={USERS} />);

    fireEvent.change(screen.getByPlaceholderText('Rechercher un nom ou un email…'), {
      target: { value: 'delvaux' },
    });

    expect(screen.getByText('Sophie Delvaux')).toBeInTheDocument();
    expect(screen.queryByText('Julien Lemaire')).not.toBeInTheDocument();
  });

  it('filtre par role', () => {
    render(<UsersTable users={USERS} />);

    fireEvent.change(screen.getByDisplayValue('Tous les rôles'), { target: { value: 'SUPER_ADMIN' } });

    expect(screen.getByText('Adrien Mertens')).toBeInTheDocument();
    expect(screen.queryByText('Julien Lemaire')).not.toBeInTheDocument();
  });

  it("affiche un message dedie quand la recherche ne trouve rien", () => {
    render(<UsersTable users={USERS} />);
    fireEvent.change(screen.getByPlaceholderText('Rechercher un nom ou un email…'), {
      target: { value: 'inexistant' },
    });
    expect(screen.getByText('Aucun utilisateur ne correspond à cette recherche.')).toBeInTheDocument();
  });

  it("trie par nom en cliquant sur l'en-tete", () => {
    render(<UsersTable users={USERS} />);
    const rows = () => screen.getAllByRole('row').slice(1);

    fireEvent.click(screen.getByRole('button', { name: 'Nom' }));
    expect(within(rows()[0]).getByText('Adrien Mertens')).toBeInTheDocument();
    expect(within(rows()[2]).getByText('Sophie Delvaux')).toBeInTheDocument();
  });

  it('pagine par 25 lignes', () => {
    const many: UserRow[] = Array.from({ length: 26 }, (_, i) => ({
      id: `u${i}`,
      name: `Utilisateur ${String(i).padStart(2, '0')}`,
      email: `user${i}@test.be`,
      role: 'CABINET_RH',
      status: 'actif',
      cabinetName: null,
      createdAt: new Date(2026, 0, 1 + i).toISOString(),
      deletedAt: null,
    }));
    render(<UsersTable users={many} />);

    expect(screen.getByText('Utilisateur 00')).toBeInTheDocument();
    expect(screen.queryByText('Utilisateur 25')).not.toBeInTheDocument();
    expect(screen.getByText(/page 1 sur 2/)).toBeInTheDocument();
  });
});

describe('UsersTable - SuperAdmin protege', () => {
  it("n'affiche aucune action pour un SuperAdmin", () => {
    render(<UsersTable users={USERS} />);
    const row = screen.getAllByRole('row')[3];

    expect(within(row).queryByRole('button', { name: /Archiver/ })).not.toBeInTheDocument();
    // Cellule Actions (derniere colonne) : tiret, pas de bouton.
    const cells = within(row).getAllByRole('cell');
    expect(cells[cells.length - 1].textContent).toBe('—');
  });
});

describe('UsersTable - archivage et restauration', () => {
  it("demande confirmation avant d'archiver, puis appelle DELETE et rafraichit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<UsersTable users={USERS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archiver Julien Lemaire' }));

    expect(screen.getByText('Archiver cet utilisateur ?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/1', { method: 'DELETE' }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(screen.queryByText('Archiver cet utilisateur ?')).not.toBeInTheDocument();
  });

  it('affiche le badge "Archivé", la date de purge, un bouton Restaurer et masque Archiver', () => {
    const archived: UserRow[] = [{ ...USERS[0], deletedAt: '2026-08-01T00:00:00.000Z' }];
    render(<UsersTable users={archived} />);
    const row = screen.getAllByRole('row')[1];

    expect(within(row).getByText('Archivé')).toBeInTheDocument();
    expect(within(row).getByText(/Purge le/)).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Restaurer' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /^Archiver/ })).not.toBeInTheDocument();
  });

  it('restaure un utilisateur archive sans demander de confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const archived: UserRow[] = [{ ...USERS[0], deletedAt: '2026-08-01T00:00:00.000Z' }];

    render(<UsersTable users={archived} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/1', { method: 'PUT' }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("affiche un message d'erreur si la requete d'archivage echoue", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    render(<UsersTable users={USERS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archiver Julien Lemaire' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }));

    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeInTheDocument();
  });
});

describe('UsersTable - suspension et reactivation', () => {
  it('demande confirmation avant de suspendre, puis appelle PATCH et rafraichit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<UsersTable users={USERS} />);
    fireEvent.click(within(screen.getAllByRole('row')[1]).getByRole('button', { name: 'Suspendre' }));

    expect(screen.getByText('Suspendre cet utilisateur ?')).toBeInTheDocument();

    // Le bouton de confirmation de la modale est le dernier "Suspendre" dans
    // le DOM (le premier est celui de la ligne).
    const suspendButtons = screen.getAllByRole('button', { name: 'Suspendre' });
    fireEvent.click(suspendButtons[suspendButtons.length - 1]);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'suspendu' }),
      }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(screen.queryByText('Suspendre cet utilisateur ?')).not.toBeInTheDocument();
  });

  it('reactive directement sans demander de confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<UsersTable users={USERS} />);
    fireEvent.click(within(screen.getAllByRole('row')[2]).getByRole('button', { name: 'Réactiver' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/users/2',
        expect.objectContaining({ body: JSON.stringify({ status: 'actif' }) }),
      ),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('filtre par statut "Suspendu"', () => {
    render(<UsersTable users={USERS} />);

    fireEvent.change(screen.getByDisplayValue('Tous les statuts'), { target: { value: 'suspendu' } });

    expect(screen.getByText('Sophie Delvaux')).toBeInTheDocument();
    expect(screen.queryByText('Julien Lemaire')).not.toBeInTheDocument();
  });
});
