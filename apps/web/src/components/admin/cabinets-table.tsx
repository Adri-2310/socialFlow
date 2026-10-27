'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CabinetDialogs, CabinetRowActions } from '@/components/admin/cabinet-actions';
import {
  DataCell,
  DataTable,
  type DataTableColumn,
  type SortDirection,
} from '@/components/shared/data-table';
import { ListFilters } from '@/components/shared/list-filters';
import { Notice } from '@/components/shared/notice';
import { StatusBadge } from '@/components/shared/status-badge';
import { TablePagination } from '@/components/shared/table-pagination';
import { Badge } from '@/components/ui/badge';
import { TableRow } from '@/components/ui/table';
import type { SuspensionType } from '@/lib/cabinet/cabinet-suspension';

export type CabinetRow = {
  id: string;
  name: string;
  status: string;
  // D71 : nature de la suspension (null si le cabinet n'est pas suspendu).
  suspensionType?: SuspensionType | null;
  plan: string | null;
  gestionnaireCount: number;
  createdAt: string;
  deletedAt: string | null;
};

type SortKey = 'name' | 'plan' | 'gestionnaireCount' | 'createdAt' | 'status';

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

// Statut affiche : l'archivage (deletedAt) est un etat terminal qui prime
// sur le statut actif/suspendu sous-jacent (inchange en base, voir
// api/admin/cabinets/[id]/route.ts).
function displayStatus(c: CabinetRow): string {
  return c.deletedAt ? 'archive' : c.status;
}

// Libelle du badge : une suspension precise sa nature (D71).
function statusLabel(c: CabinetRow): string | undefined {
  if (displayStatus(c) !== 'suspendu') return undefined;
  if (c.suspensionType === 'READ_ONLY') return 'Suspendu · lecture seule';
  if (c.suspensionType === 'BLOCKED') return 'Suspendu · bloqué';
  return undefined;
}

// Tri : direction par defaut differente selon la colonne (nom/plan/statut ->
// A-Z en premier ; nombre de gestionnaires/date de creation -> le plus grand
// ou le plus recent en premier, plus utile au premier clic).
const DEFAULT_SORT_DIRECTION: Record<SortKey, SortDirection> = {
  name: 'asc',
  plan: 'asc',
  status: 'asc',
  gestionnaireCount: 'desc',
  createdAt: 'desc',
};

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-BE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const PAGE_SIZE = 25;

const STATUS_FILTERS = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'actif', label: 'Actif' },
  { value: 'suspendu', label: 'Suspendu' },
  { value: 'archive', label: 'Archivé' },
];

const ERROR_MESSAGE = 'Une erreur est survenue. Réessayez.';

// `limit` + `manageHref` : mode apercu utilise sur la vue d'ensemble (pas de
// recherche/filtre/tri/pagination, juste les N premiers + un lien vers la
// liste complete). Sans ces props : page dediee /dashboard/admin/cabinets,
// avec recherche/filtre/tri et pagination cote client (le nombre de
// cabinets attendu pour un TFE reste petit, pas besoin d'une pagination
// serveur).
export function CabinetsTable({
  cabinets,
  limit,
  manageHref,
}: {
  cabinets: CabinetRow[];
  limit?: number;
  manageHref?: string;
}) {
  const router = useRouter();
  const isPreview = typeof limit === 'number';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [pendingCabinet, setPendingCabinet] = useState<CabinetRow | null>(null);
  // Motif refusé par le serveur : la modale reste ouverte pour le corriger.
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const [pendingBlockCabinet, setPendingBlockCabinet] = useState<CabinetRow | null>(null);
  const [pendingArchiveCabinet, setPendingArchiveCabinet] = useState<CabinetRow | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (isPreview) return cabinets;
    const q = search.trim().toLowerCase();
    return cabinets.filter((c) => {
      const matchesSearch = !q || c.name.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || displayStatus(c) === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [cabinets, search, statusFilter, isPreview]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'plan':
          return (a.plan ?? '').localeCompare(b.plan ?? '') * dir;
        case 'status':
          return displayStatus(a).localeCompare(displayStatus(b)) * dir;
        case 'gestionnaireCount':
          return (a.gestionnaireCount - b.gestionnaireCount) * dir;
        case 'createdAt':
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
        default:
          return 0;
      }
    });
  }, [filtered, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginated = isPreview
    ? sorted.slice(0, limit)
    : sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateStatusFilter(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(DEFAULT_SORT_DIRECTION[key]);
    }
    setPage(1);
  }

  async function updateStatus(
    id: string,
    status: 'actif' | 'suspendu',
    suspension?: { mode: SuspensionType; reason: string },
  ) {
    setLoadingId(id);
    setError(null);
    setSuspendError(null);
    try {
      const res = await fetch(`/api/admin/cabinets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...suspension }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        // Erreur de saisie : on garde le dialogue ouvert pour la corriger.
        if (body?.error === 'REASON_REQUIRED') {
          setSuspendError('Un motif est obligatoire pour bloquer les connexions.');
          return;
        }
        if (body?.error === 'REASON_TOO_LONG') {
          setSuspendError('Le motif est trop long.');
          return;
        }
        throw new Error('request_failed');
      }
      setPendingCabinet(null);
      setPendingBlockCabinet(null);
      router.refresh();
    } catch {
      setError(ERROR_MESSAGE);
      setPendingCabinet(null);
      setPendingBlockCabinet(null);
    } finally {
      setLoadingId(null);
    }
  }

  async function archiveCabinet(id: string) {
    setLoadingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cabinets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('request_failed');
      router.refresh();
    } catch {
      setError(ERROR_MESSAGE);
    } finally {
      setLoadingId(null);
      setPendingArchiveCabinet(null);
    }
  }

  async function restoreCabinet(id: string) {
    setLoadingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cabinets/${id}`, { method: 'PUT' });
      if (!res.ok) throw new Error('request_failed');
      router.refresh();
    } catch {
      setError(ERROR_MESSAGE);
    } finally {
      setLoadingId(null);
    }
  }

  function sortOf(key: SortKey): DataTableColumn['sort'] {
    return { direction: sortKey === key ? sortDirection : null, onToggle: () => toggleSort(key) };
  }

  const columns: DataTableColumn[] = isPreview
    ? [
        { key: 'name', header: 'Cabinet' },
        { key: 'plan', header: 'Plan' },
        { key: 'status', header: 'Statut' },
      ]
    : [
        { key: 'name', header: 'Cabinet', sort: sortOf('name') },
        { key: 'plan', header: 'Plan', sort: sortOf('plan') },
        { key: 'gestionnaires', header: 'Gestionnaires', sort: sortOf('gestionnaireCount') },
        { key: 'createdAt', header: 'Créé le', sort: sortOf('createdAt') },
        { key: 'status', header: 'Statut', sort: sortOf('status') },
        { key: 'actions', header: 'Actions', align: 'right' },
      ];

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-foreground">Cabinets clients</h2>
          <p className="text-sm text-muted-foreground">Gestion et supervision des cabinets.</p>
        </div>
        {isPreview ? (
          manageHref && (
            <Link href={manageHref} className="text-sm font-medium text-primary hover:underline">
              Voir tous les cabinets ({cabinets.length}) →
            </Link>
          )
        ) : (
          <ListFilters
            search={{
              value: search,
              onChange: updateSearch,
              label: 'Rechercher un cabinet',
              placeholder: 'Rechercher un cabinet…',
            }}
            filters={[
              {
                label: 'Filtrer par statut',
                value: statusFilter,
                onChange: updateStatusFilter,
                options: STATUS_FILTERS,
              },
            ]}
          />
        )}
      </div>

      {error && (
        <Notice tone="danger" role="alert" className="mx-5 mt-3">
          {error}
        </Notice>
      )}

      <DataTable
        caption="Cabinets clients"
        columns={columns}
        isEmpty={filtered.length === 0}
        emptyMessage={
          isPreview
            ? 'Aucun cabinet pour le moment.'
            : 'Aucun cabinet ne correspond à cette recherche.'
        }
        className="rounded-none border-0 bg-transparent"
      >
        {paginated.map((c) => (
          <TableRow key={c.id}>
            <DataCell className="font-medium text-foreground">{c.name}</DataCell>
            <DataCell>
              <Badge variant="secondary" className="h-auto rounded-md px-2 py-0.5">
                {c.plan ? (PLAN_LABELS[c.plan] ?? c.plan) : '—'}
              </Badge>
            </DataCell>
            {!isPreview && (
              <>
                <DataCell className="text-foreground">{c.gestionnaireCount}</DataCell>
                <DataCell className="text-muted-foreground">
                  {DATE_FORMATTER.format(new Date(c.createdAt))}
                </DataCell>
              </>
            )}
            <DataCell>
              <StatusBadge domain="compte" status={displayStatus(c)} label={statusLabel(c)} dot />
            </DataCell>
            {!isPreview && (
              <DataCell className="text-right">
                <CabinetRowActions
                  cabinet={c}
                  loading={loadingId === c.id}
                  onSuspend={() => setPendingCabinet(c)}
                  onBlock={() => setPendingBlockCabinet(c)}
                  onReactivate={() => updateStatus(c.id, 'actif')}
                  onArchive={() => setPendingArchiveCabinet(c)}
                  onRestore={() => restoreCabinet(c.id)}
                />
              </DataCell>
            )}
          </TableRow>
        ))}
      </DataTable>

      <TablePagination
        page={currentPage}
        pageCount={isPreview ? 1 : pageCount}
        onPageChange={setPage}
        className="px-5 py-3"
      >
        {isPreview
          ? `${paginated.length} sur ${cabinets.length} cabinet${cabinets.length > 1 ? 's' : ''}`
          : `${filtered.length} cabinet${filtered.length > 1 ? 's' : ''}${pageCount > 1 ? ` — page ${currentPage} sur ${pageCount}` : ''}`}
      </TablePagination>

      <CabinetDialogs
        pendingSuspend={pendingCabinet}
        pendingBlock={pendingBlockCabinet}
        pendingArchive={pendingArchiveCabinet}
        loadingId={loadingId}
        suspendError={suspendError}
        onCancelSuspend={() => {
          setPendingCabinet(null);
          setSuspendError(null);
        }}
        onCancelBlock={() => {
          setPendingBlockCabinet(null);
          setSuspendError(null);
        }}
        onCancelArchive={() => setPendingArchiveCabinet(null)}
        onConfirmSuspension={(id, input) => updateStatus(id, 'suspendu', input)}
        onConfirmArchive={archiveCabinet}
      />
    </section>
  );
}
