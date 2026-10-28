'use client';

import type { ComponentProps, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Cellule d'un tableau de données : même rembourrage que l'en-tête, et le texte peut passer à la
// ligne (le `whitespace-nowrap` de shadcn ferait déborder les libellés longs).
export function DataCell({ className, ...props }: ComponentProps<typeof TableCell>) {
  return <TableCell className={cn('px-4 py-3 whitespace-normal', className)} {...props} />;
}

export type SortDirection = 'asc' | 'desc';

export type DataTableColumn = {
  key: string;
  header: ReactNode;
  // Masque l'en-tête visuellement (colonne d'actions) tout en le gardant pour les lecteurs d'écran.
  srOnlyHeader?: boolean;
  align?: 'left' | 'right';
  className?: string;
  // Colonne triable : le tri lui-même (données, état) reste chez l'appelant.
  sort?: { direction: SortDirection | null; onToggle: () => void };
};

function ariaSort(direction: SortDirection | null | undefined) {
  if (direction === 'asc') return 'ascending';
  if (direction === 'desc') return 'descending';
  return 'none';
}

// Squelette commun des tableaux : en-têtes, tri accessible, état vide et chargement. Les lignes
// (`children`, des <TableRow>) restent écrites par l'appelant : le composant ne sait ni trier ni
// filtrer, pour ne rien changer au comportement de chaque tableau.
export function DataTable({
  columns,
  caption,
  isEmpty = false,
  emptyMessage = 'Aucun résultat.',
  loading = false,
  loadingRows = 5,
  className,
  children,
}: {
  columns: DataTableColumn[];
  // Titre du tableau pour les lecteurs d'écran.
  caption?: string;
  isEmpty?: boolean;
  emptyMessage?: ReactNode;
  loading?: boolean;
  loadingRows?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-border bg-card', className)}>
      <Table>
        {caption && <TableCaption className="sr-only">{caption}</TableCaption>}
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                aria-sort={column.sort ? ariaSort(column.sort.direction) : undefined}
                className={cn(
                  'h-auto px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase',
                  column.align === 'right' && 'text-right',
                  column.className,
                )}
              >
                {column.sort ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={column.sort.onToggle}
                    className="-ml-2 h-auto gap-1 px-2 py-1 text-xs tracking-wide uppercase"
                  >
                    {column.header}
                    {column.sort.direction === 'asc' ? (
                      <ArrowUp aria-hidden="true" />
                    ) : column.sort.direction === 'desc' ? (
                      <ArrowDown aria-hidden="true" />
                    ) : (
                      <ArrowUpDown aria-hidden="true" />
                    )}
                  </Button>
                ) : column.srOnlyHeader ? (
                  <span className="sr-only">{column.header}</span>
                ) : (
                  column.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: loadingRows }, (_, row) => (
              <TableRow key={row} data-testid="data-table-loading-row">
                {columns.map((column) => (
                  <TableCell key={column.key} className="px-4 py-3">
                    <Skeleton className="h-4 w-full max-w-40" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : isEmpty ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="px-4 py-10 text-center whitespace-normal text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            children
          )}
        </TableBody>
      </Table>
    </div>
  );
}
