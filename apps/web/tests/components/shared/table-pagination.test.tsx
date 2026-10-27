import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TablePagination } from '@/components/shared/table-pagination';

describe('TablePagination', () => {
  const rendre = (page: number, pageCount: number) => {
    const onPageChange = vi.fn();
    render(
      <TablePagination page={page} pageCount={pageCount} onPageChange={onPageChange}>
        {`Page ${page} sur ${pageCount}`}
      </TablePagination>,
    );
    return onPageChange;
  };

  it('affiche le résumé dans une navigation nommée « Pagination »', () => {
    rendre(1, 3);

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('Page 1 sur 3');
  });

  it('une seule page : le résumé reste, sans boutons', () => {
    rendre(1, 1);

    expect(screen.getByText('Page 1 sur 1')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('première page : « Précédent » désactivé, « Suivant » demande la page 2', async () => {
    const onPageChange = rendre(1, 3);

    expect(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('page du milieu : les deux boutons demandent la page voisine', async () => {
    const onPageChange = rendre(2, 3);

    await userEvent.click(screen.getByRole('button', { name: 'Précédent' }));
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it('dernière page : « Suivant » désactivé', () => {
    rendre(3, 3);

    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeEnabled();
  });
});
