import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { TableCell, TableRow } from '@/components/ui/table';

const COLUMNS: DataTableColumn[] = [
  { key: 'nom', header: 'Nom' },
  { key: 'statut', header: 'Statut' },
  { key: 'actions', header: 'Actions', srOnlyHeader: true, align: 'right' },
];

describe('DataTable', () => {
  it('affiche les en-têtes et les lignes de l’appelant', () => {
    render(
      <DataTable columns={COLUMNS} caption="Salariés">
        <TableRow>
          <TableCell>Karim</TableCell>
          <TableCell>Actif</TableCell>
          <TableCell>Voir</TableCell>
        </TableRow>
      </DataTable>,
    );

    const table = screen.getByRole('table', { name: 'Salariés' });
    expect(within(table).getByRole('columnheader', { name: 'Nom' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: 'Karim' })).toBeInTheDocument();
  });

  it('garde l’en-tête de la colonne d’actions pour les lecteurs d’écran seulement', () => {
    render(<DataTable columns={COLUMNS} />);

    const header = screen.getByRole('columnheader', { name: 'Actions' });
    expect(header.querySelector('.sr-only')).not.toBeNull();
  });

  it('affiche le message d’état vide à la place des lignes', () => {
    render(
      <DataTable columns={COLUMNS} isEmpty emptyMessage="Aucun salarié">
        <TableRow>
          <TableCell>ne doit pas apparaître</TableCell>
        </TableRow>
      </DataTable>,
    );

    const cell = screen.getByRole('cell', { name: 'Aucun salarié' });
    expect(cell).toHaveAttribute('colspan', String(COLUMNS.length));
    expect(screen.queryByText('ne doit pas apparaître')).not.toBeInTheDocument();
  });

  it('affiche des lignes de chargement à la place du contenu', () => {
    render(
      <DataTable columns={COLUMNS} loading loadingRows={3} isEmpty>
        <TableRow>
          <TableCell>ne doit pas apparaître</TableCell>
        </TableRow>
      </DataTable>,
    );

    expect(screen.getAllByTestId('data-table-loading-row')).toHaveLength(3);
    expect(screen.queryByText('ne doit pas apparaître')).not.toBeInTheDocument();
    expect(screen.queryByText('Aucun résultat.')).not.toBeInTheDocument();
  });

  describe('colonne triable', () => {
    it('annonce l’ordre courant avec aria-sort', () => {
      render(
        <DataTable
          columns={[
            { key: 'nom', header: 'Nom', sort: { direction: 'asc', onToggle: () => {} } },
            { key: 'statut', header: 'Statut', sort: { direction: null, onToggle: () => {} } },
            { key: 'date', header: 'Date', sort: { direction: 'desc', onToggle: () => {} } },
          ]}
        />,
      );

      expect(screen.getByRole('columnheader', { name: 'Nom' })).toHaveAttribute(
        'aria-sort',
        'ascending',
      );
      expect(screen.getByRole('columnheader', { name: 'Statut' })).toHaveAttribute(
        'aria-sort',
        'none',
      );
      expect(screen.getByRole('columnheader', { name: 'Date' })).toHaveAttribute(
        'aria-sort',
        'descending',
      );
    });

    it('appelle onToggle au clic et au clavier', async () => {
      const onToggle = vi.fn();
      render(
        <DataTable
          columns={[{ key: 'nom', header: 'Nom', sort: { direction: null, onToggle } }]}
        />,
      );

      const button = screen.getByRole('button', { name: 'Nom' });
      await userEvent.click(button);
      button.focus();
      await userEvent.keyboard('{Enter}');

      expect(onToggle).toHaveBeenCalledTimes(2);
    });

    it('ne pose pas aria-sort sur une colonne non triable', () => {
      render(<DataTable columns={[{ key: 'nom', header: 'Nom' }]} />);

      expect(screen.getByRole('columnheader', { name: 'Nom' })).not.toHaveAttribute('aria-sort');
    });
  });
});
