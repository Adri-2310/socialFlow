import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CabinetsTable, type CabinetRow } from '@/components/admin/cabinets-table';
import { CABINET_DELETION_RETENTION_DAYS } from '@/lib/cabinet/cabinet-retention';

// Compléments au test de la liste des cabinets (console SuperAdmin) : états des lignes, erreurs,
// envoi en cours, résumé, tri par défaut des colonnes.
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const FORMAT_DATE = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' });

const cabinet = (surcharge: Partial<CabinetRow> = {}): CabinetRow => ({
  id: 'c1',
  name: 'Alpha Cabinet',
  status: 'actif',
  plan: 'starter',
  gestionnaireCount: 2,
  createdAt: '2026-01-10T00:00:00.000Z',
  deletedAt: null,
  ...surcharge,
});

const reponse = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: async () => body });
const ligne = (nom: string) => screen.getByRole('row', { name: new RegExp(nom) });

beforeEach(() => {
  refreshMock.mockReset();
  vi.unstubAllGlobals();
});

describe('CabinetsTable : actions selon l’état du cabinet', () => {
  it('actif : « Suspendre » et l’archivage, sans « Réactiver » ni « Bloquer »', () => {
    render(<CabinetsTable cabinets={[cabinet()]} />);
    const rangee = ligne('Alpha Cabinet');

    expect(within(rangee).getByRole('button', { name: 'Suspendre' })).toBeEnabled();
    expect(within(rangee).getByRole('button', { name: 'Archiver Alpha Cabinet' })).toBeEnabled();
    expect(within(rangee).queryByRole('button', { name: 'Réactiver' })).not.toBeInTheDocument();
    expect(within(rangee).queryByRole('button', { name: 'Bloquer' })).not.toBeInTheDocument();
  });

  it('suspendu en lecture seule : « Bloquer », « Réactiver » et l’archivage', () => {
    render(<CabinetsTable cabinets={[cabinet({ status: 'suspendu', suspensionType: 'READ_ONLY' })]} />);
    const rangee = ligne('Alpha Cabinet');

    expect(within(rangee).getByRole('button', { name: 'Bloquer' })).toBeInTheDocument();
    expect(within(rangee).getByRole('button', { name: 'Réactiver' })).toBeInTheDocument();
    expect(within(rangee).getByRole('button', { name: 'Archiver Alpha Cabinet' })).toBeInTheDocument();
    expect(within(rangee).queryByRole('button', { name: 'Suspendre' })).not.toBeInTheDocument();
  });

  it('suspendu avec blocage : pas de « Bloquer » (déjà bloqué)', () => {
    render(<CabinetsTable cabinets={[cabinet({ status: 'suspendu', suspensionType: 'BLOCKED' })]} />);

    expect(screen.queryByRole('button', { name: 'Bloquer' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réactiver' })).toBeInTheDocument();
  });

  it('archivé : la date de purge tient compte du délai de conservation', () => {
    const supprime = '2026-08-01T00:00:00.000Z';
    render(<CabinetsTable cabinets={[cabinet({ deletedAt: supprime })]} />);

    const purge = new Date(new Date(supprime).getTime() + CABINET_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    expect(screen.getByText(`Purge le ${FORMAT_DATE.format(purge)}`)).toBeInTheDocument();
  });

  it('plan inconnu affiché tel quel, plan absent par un tiret', () => {
    render(
      <CabinetsTable
        cabinets={[cabinet({ plan: 'sur-mesure' }), cabinet({ id: 'c2', name: 'Beta Cabinet', plan: null })]}
      />,
    );

    expect(within(ligne('Alpha Cabinet')).getByText('sur-mesure')).toBeInTheDocument();
    expect(within(ligne('Beta Cabinet')).getByText('—')).toBeInTheDocument();
  });
});

describe('CabinetsTable : envoi en cours et erreurs', () => {
  it('désactive les boutons de la ligne pendant la réactivation', async () => {
    let finir: (valeur: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((resolve) => (finir = resolve))));
    render(<CabinetsTable cabinets={[cabinet({ status: 'suspendu', suspensionType: 'READ_ONLY' })]} />);
    const rangee = ligne('Alpha Cabinet');

    fireEvent.click(within(rangee).getByRole('button', { name: 'Réactiver' }));

    await waitFor(() =>
      within(rangee)
        .getAllByRole('button')
        .forEach((bouton) => expect(bouton).toBeDisabled()),
    );
    finir(reponse(200));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('une réactivation refusée affiche l’erreur et réactive les boutons', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse(500)));
    render(<CabinetsTable cabinets={[cabinet({ status: 'suspendu', suspensionType: 'READ_ONLY' })]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Réactiver' }));

    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Réactiver' })).toBeEnabled());
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('une restauration refusée affiche l’erreur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse(500)));
    render(<CabinetsTable cabinets={[cabinet({ deletedAt: '2026-08-01T00:00:00.000Z' })]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }));

    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeInTheDocument();
  });

  it('un archivage refusé affiche l’erreur et ferme la confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse(500)));
    render(<CabinetsTable cabinets={[cabinet()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archiver Alpha Cabinet' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Archiver' }));

    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Archiver ce cabinet ?')).not.toBeInTheDocument());
  });

  it('annuler la confirmation d’archivage n’envoie rien', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<CabinetsTable cabinets={[cabinet()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archiver Alpha Cabinet' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByText('Archiver ce cabinet ?')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('annuler la suspension n’envoie rien et ferme la modale', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<CabinetsTable cabinets={[cabinet()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suspendre' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByText('Suspendre ce cabinet ?')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un motif refusé par le serveur reste dans la modale, sans message général', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse(400, { error: 'REASON_REQUIRED' })));
    render(<CabinetsTable cabinets={[cabinet({ status: 'suspendu', suspensionType: 'READ_ONLY' })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bloquer' }));
    fireEvent.change(await screen.findByLabelText(/Motif/), { target: { value: 'Fraude' } });

    fireEvent.click(screen.getByRole('button', { name: 'Bloquer les connexions' }));

    const modale = await screen.findByRole('dialog');
    expect(await within(modale).findByRole('alert')).toHaveTextContent(
      'Un motif est obligatoire pour bloquer les connexions.',
    );
    expect(screen.queryByText('Une erreur est survenue. Réessayez.')).not.toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe('CabinetsTable : résumé, tri et recherche', () => {
  it('résume le nombre de cabinets, au singulier comme au pluriel', () => {
    const { unmount } = render(<CabinetsTable cabinets={[cabinet()]} />);
    expect(screen.getByText('1 cabinet')).toBeInTheDocument();
    unmount();

    render(<CabinetsTable cabinets={[cabinet(), cabinet({ id: 'c2', name: 'Beta Cabinet' })]} />);
    expect(screen.getByText('2 cabinets')).toBeInTheDocument();
  });

  it('en aperçu : « n sur total », statut visible, aucun lien sans adresse', () => {
    render(<CabinetsTable cabinets={[cabinet(), cabinet({ id: 'c2', name: 'Beta Cabinet' })]} limit={1} />);

    expect(screen.getByText('1 sur 2 cabinets')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('trie par date de création en commençant par la plus récente', () => {
    render(
      <CabinetsTable
        cabinets={[
          cabinet({ id: 'a', name: 'Ancien', createdAt: '2025-01-01T00:00:00.000Z' }),
          cabinet({ id: 'b', name: 'Récent', createdAt: '2026-06-01T00:00:00.000Z' }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Créé le' }));

    const rangees = screen.getAllByRole('row').slice(1);
    expect(within(rangees[0]).getByText('Récent')).toBeInTheDocument();
  });

  it('trie par statut', () => {
    render(
      <CabinetsTable
        cabinets={[
          cabinet({ id: 'a', name: 'Cabinet suspendu', status: 'suspendu' }),
          cabinet({ id: 'b', name: 'Cabinet actif' }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Statut' }));

    const rangees = screen.getAllByRole('row').slice(1);
    expect(within(rangees[0]).getByText('Cabinet actif')).toBeInTheDocument();
  });

  it('une nouvelle recherche revient à la première page', () => {
    const beaucoup = Array.from({ length: 30 }, (_, i) =>
      cabinet({ id: `c${i}`, name: `Cabinet ${String(i).padStart(2, '0')}` }),
    );
    render(<CabinetsTable cabinets={beaucoup} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByText(/page 2 sur 2/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Rechercher un cabinet…'), { target: { value: 'Cabinet' } });

    expect(screen.getByText(/page 1 sur 2/)).toBeInTheDocument();
  });

  it('propose les quatre filtres de statut', () => {
    render(<CabinetsTable cabinets={[cabinet()]} />);

    const filtre = screen.getByDisplayValue('Tous les statuts');
    expect(within(filtre).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tous les statuts',
      'Actif',
      'Suspendu',
      'Archivé',
    ]);
  });
});
