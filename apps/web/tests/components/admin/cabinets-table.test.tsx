import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CabinetsTable, type CabinetRow } from '@/components/admin/cabinets-table';

const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' });

const CABINETS: CabinetRow[] = [
  { id: '1', name: 'Alpha Cabinet', status: 'actif', plan: 'starter', gestionnaireCount: 2, createdAt: '2026-01-10T00:00:00.000Z' },
  { id: '2', name: 'Beta Cabinet', status: 'suspendu', plan: 'pro', gestionnaireCount: 0, createdAt: '2026-03-05T00:00:00.000Z' },
  { id: '3', name: 'Gamma Cabinet', status: 'actif', plan: null, gestionnaireCount: 5, createdAt: '2025-12-01T00:00:00.000Z' },
];

function manyCabinets(count: number): CabinetRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    name: `Cabinet ${String(i).padStart(2, '0')}`,
    status: 'actif',
    plan: 'starter',
    gestionnaireCount: i,
    createdAt: new Date(2026, 0, 1 + i).toISOString(),
  }));
}

beforeEach(() => {
  refreshMock.mockReset();
  vi.unstubAllGlobals();
});

describe('CabinetsTable - mode apercu', () => {
  it('affiche uniquement les colonnes simplifiees et limite le nombre de lignes', () => {
    render(<CabinetsTable cabinets={CABINETS} limit={2} manageHref="/dashboard/admin/cabinets" />);

    expect(screen.getByText('Alpha Cabinet')).toBeInTheDocument();
    expect(screen.getByText('Beta Cabinet')).toBeInTheDocument();
    expect(screen.queryByText('Gamma Cabinet')).not.toBeInTheDocument();

    expect(screen.queryByPlaceholderText('Rechercher un cabinet…')).not.toBeInTheDocument();
    expect(screen.queryByText('Gestionnaires')).not.toBeInTheDocument();
    expect(screen.queryByText('Créé le')).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Voir tous les cabinets \(3\)/ })).toHaveAttribute(
      'href',
      '/dashboard/admin/cabinets',
    );
  });

  it("affiche un message d'etat vide si aucun cabinet", () => {
    render(<CabinetsTable cabinets={[]} limit={10} manageHref="/dashboard/admin/cabinets" />);
    expect(screen.getByText('Aucun cabinet pour le moment.')).toBeInTheDocument();
  });
});

describe('CabinetsTable - mode complet', () => {
  it('affiche toutes les colonnes, y compris Gestionnaires et Créé le', () => {
    render(<CabinetsTable cabinets={CABINETS} />);

    expect(screen.getByText('Gestionnaires')).toBeInTheDocument();
    expect(screen.getByText('Créé le')).toBeInTheDocument();
    expect(screen.getByText(DATE_FORMATTER.format(new Date(CABINETS[0].createdAt)))).toBeInTheDocument();
  });

  it('filtre par nom via la recherche', () => {
    render(<CabinetsTable cabinets={CABINETS} />);

    fireEvent.change(screen.getByPlaceholderText('Rechercher un cabinet…'), { target: { value: 'beta' } });

    expect(screen.getByText('Beta Cabinet')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Cabinet')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma Cabinet')).not.toBeInTheDocument();
  });

  it('filtre par statut', () => {
    render(<CabinetsTable cabinets={CABINETS} />);

    fireEvent.change(screen.getByDisplayValue('Tous les statuts'), { target: { value: 'suspendu' } });

    expect(screen.getByText('Beta Cabinet')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Cabinet')).not.toBeInTheDocument();
  });

  it("affiche un message dedie quand la recherche ne trouve rien", () => {
    render(<CabinetsTable cabinets={CABINETS} />);
    fireEvent.change(screen.getByPlaceholderText('Rechercher un cabinet…'), { target: { value: 'inexistant' } });
    expect(screen.getByText('Aucun cabinet ne correspond à cette recherche.')).toBeInTheDocument();
  });

  it('trie par nom en cliquant sur l\'en-tete, puis inverse au second clic', () => {
    render(<CabinetsTable cabinets={CABINETS} />);
    const rows = () => screen.getAllByRole('row').slice(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cabinet' }));
    expect(within(rows()[0]).getByText('Alpha Cabinet')).toBeInTheDocument();
    expect(within(rows()[2]).getByText('Gamma Cabinet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cabinet' }));
    expect(within(rows()[0]).getByText('Gamma Cabinet')).toBeInTheDocument();
    expect(within(rows()[2]).getByText('Alpha Cabinet')).toBeInTheDocument();
  });

  it('trie par nombre de gestionnaires en commencant par le plus grand (defaut desc)', () => {
    render(<CabinetsTable cabinets={CABINETS} />);
    const rows = () => screen.getAllByRole('row').slice(1);

    fireEvent.click(screen.getByRole('button', { name: 'Gestionnaires' }));
    expect(within(rows()[0]).getByText('Gamma Cabinet')).toBeInTheDocument();
    expect(within(rows()[2]).getByText('Beta Cabinet')).toBeInTheDocument();
  });

  it('pagine par 25 lignes et navigue entre les pages', () => {
    render(<CabinetsTable cabinets={manyCabinets(26)} />);

    expect(screen.getByText('Cabinet 00')).toBeInTheDocument();
    expect(screen.queryByText('Cabinet 25')).not.toBeInTheDocument();
    expect(screen.getByText(/page 1 sur 2/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));

    expect(screen.getByText('Cabinet 25')).toBeInTheDocument();
    expect(screen.queryByText('Cabinet 00')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled();
  });
});

describe('CabinetsTable - suspension et reactivation', () => {
  it('demande confirmation avant de suspendre, puis appelle PATCH et rafraichit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<CabinetsTable cabinets={CABINETS} />);
    fireEvent.click(within(screen.getAllByRole('row')[1]).getByRole('button', { name: 'Suspendre' }));

    expect(screen.getByText('Suspendre ce cabinet ?')).toBeInTheDocument();

    // La ligne "Gamma Cabinet" a aussi un bouton "Suspendre" : le bouton de
    // confirmation de la modale est le dernier dans l'ordre du DOM.
    const suspendButtons = screen.getAllByRole('button', { name: 'Suspendre' });
    fireEvent.click(suspendButtons[suspendButtons.length - 1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/cabinets/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'suspendu' }),
    }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(screen.queryByText('Suspendre ce cabinet ?')).not.toBeInTheDocument();
  });

  it('reactive directement sans demander de confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<CabinetsTable cabinets={CABINETS} />);
    fireEvent.click(within(screen.getAllByRole('row')[2]).getByRole('button', { name: 'Réactiver' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/cabinets/2',
        expect.objectContaining({ body: JSON.stringify({ status: 'actif' }) }),
      ),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("affiche un message d'erreur si la requete echoue", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    render(<CabinetsTable cabinets={CABINETS} />);
    fireEvent.click(within(screen.getAllByRole('row')[1]).getByRole('button', { name: 'Suspendre' }));
    const suspendButtons = screen.getAllByRole('button', { name: 'Suspendre' });
    fireEvent.click(suspendButtons[suspendButtons.length - 1]);

    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeInTheDocument();
  });
});
