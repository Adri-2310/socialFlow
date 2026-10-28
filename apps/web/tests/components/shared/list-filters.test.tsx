import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListFilters } from '@/components/shared/list-filters';

describe('ListFilters', () => {
  const rendre = (surcharge: Partial<React.ComponentProps<typeof ListFilters>> = {}) => {
    const onSearch = vi.fn();
    const onStatus = vi.fn();
    render(
      <ListFilters
        search={{
          value: '',
          onChange: onSearch,
          label: 'Rechercher un cabinet',
          placeholder: 'Rechercher un cabinet…',
        }}
        filters={[
          {
            label: 'Filtrer par statut',
            value: 'all',
            onChange: onStatus,
            options: [
              { value: 'all', label: 'Tous les statuts' },
              { value: 'actif', label: 'Actif' },
            ],
          },
        ]}
        {...surcharge}
      />,
    );
    return { onSearch, onStatus };
  };

  it('donne un nom accessible à la recherche et à chaque liste', () => {
    rendre();

    expect(screen.getByRole('searchbox', { name: 'Rechercher un cabinet' })).toHaveAttribute(
      'placeholder',
      'Rechercher un cabinet…',
    );
    expect(screen.getByRole('combobox', { name: 'Filtrer par statut' })).toHaveValue('all');
  });

  it('transmet le texte saisi', async () => {
    const { onSearch } = rendre();

    await userEvent.type(screen.getByRole('searchbox'), 'ab');

    expect(onSearch).toHaveBeenNthCalledWith(1, 'a');
    expect(onSearch).toHaveBeenNthCalledWith(2, 'b');
  });

  it('transmet le filtre choisi', async () => {
    const { onStatus } = rendre();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtrer par statut' }), 'actif');

    expect(onStatus).toHaveBeenCalledWith('actif');
  });

  it('liste les options dans l’ordre donné', () => {
    rendre();

    const options = within(screen.getByRole('combobox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Tous les statuts', 'Actif']);
  });

  it('sans filtre : seulement la recherche', () => {
    rendre({ filters: [] });

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
