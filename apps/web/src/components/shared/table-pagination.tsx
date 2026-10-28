'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Pied de tableau ou de liste paginée côté client : un résumé (`children`, « 12 cabinets — page 1
// sur 2 ») et les boutons « Précédent » / « Suivant », qui n'apparaissent que s'il y a plusieurs
// pages. La pagination elle-même (découpe des données, page courante) reste chez l'appelant.
// `className` règle le rembourrage, qui change entre un tableau (bords pleins) et une liste.
export function TablePagination({
  page,
  pageCount,
  onPageChange,
  className,
  children,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex items-center justify-between border-t border-border text-sm text-muted-foreground',
        className,
      )}
    >
      <span aria-live="polite">{children}</span>
      {pageCount > 1 && (
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            Précédent
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
            disabled={page === pageCount}
          >
            Suivant
          </Button>
        </div>
      )}
    </nav>
  );
}
