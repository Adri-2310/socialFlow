'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Loader2, ChevronUp, ChevronDown, Archive } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CABINET_DELETION_RETENTION_DAYS } from '@/lib/cabinet-retention';

export type CabinetRow = {
  id: string;
  name: string;
  status: string;
  plan: string | null;
  gestionnaireCount: number;
  createdAt: string;
  deletedAt: string | null;
};

type SortKey = 'name' | 'plan' | 'gestionnaireCount' | 'createdAt' | 'status';
type SortDirection = 'asc' | 'desc';

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const STATUS_BADGE: Record<string, string> = {
  actif: 'bg-secondary/10 text-secondary',
  suspendu: 'bg-destructive/10 text-destructive',
  archive: 'bg-muted text-muted-foreground',
};

const STATUS_LABEL: Record<string, string> = {
  actif: 'Actif',
  suspendu: 'Suspendu',
  archive: 'Archivé',
};

// Statut affiche : l'archivage (deletedAt) est un etat terminal qui prime
// sur le statut actif/suspendu sous-jacent (inchange en base, voir
// api/admin/cabinets/[id]/route.ts).
function displayStatus(c: CabinetRow): string {
  return c.deletedAt ? 'archive' : c.status;
}

function purgeDate(deletedAt: string): Date {
  return new Date(
    new Date(deletedAt).getTime() + CABINET_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
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

function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <th className="px-5 py-3 font-semibold">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition hover:text-foreground ${active ? 'text-foreground' : ''}`}
      >
        {label}
        {active &&
          (direction === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          ))}
      </button>
    </th>
  );
}

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

  async function updateStatus(id: string, status: 'actif' | 'suspendu') {
    setLoadingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cabinets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('request_failed');
      router.refresh();
    } catch {
      setError('Une erreur est survenue. Réessayez.');
    } finally {
      setLoadingId(null);
      setPendingCabinet(null);
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
      setError('Une erreur est survenue. Réessayez.');
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
      setError('Une erreur est survenue. Réessayez.');
    } finally {
      setLoadingId(null);
    }
  }

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
          <div className="flex gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => updateSearch(e.target.value)}
                placeholder="Rechercher un cabinet…"
                className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 sm:w-56"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => updateStatusFilter(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            >
              <option value="all">Tous les statuts</option>
              <option value="actif">Actif</option>
              <option value="suspendu">Suspendu</option>
              <option value="archive">Archivé</option>
            </select>
          </div>
        )}
      </div>

      {error && <p className="px-5 pt-3 text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {isPreview ? (
                <>
                  <th className="px-5 py-3 font-semibold">Cabinet</th>
                  <th className="px-5 py-3 font-semibold">Plan</th>
                  <th className="px-5 py-3 font-semibold">Statut</th>
                </>
              ) : (
                <>
                  <SortableHeader
                    label="Cabinet"
                    active={sortKey === 'name'}
                    direction={sortDirection}
                    onClick={() => toggleSort('name')}
                  />
                  <SortableHeader
                    label="Plan"
                    active={sortKey === 'plan'}
                    direction={sortDirection}
                    onClick={() => toggleSort('plan')}
                  />
                  <SortableHeader
                    label="Gestionnaires"
                    active={sortKey === 'gestionnaireCount'}
                    direction={sortDirection}
                    onClick={() => toggleSort('gestionnaireCount')}
                  />
                  <SortableHeader
                    label="Créé le"
                    active={sortKey === 'createdAt'}
                    direction={sortDirection}
                    onClick={() => toggleSort('createdAt')}
                  />
                  <SortableHeader
                    label="Statut"
                    active={sortKey === 'status'}
                    direction={sortDirection}
                    onClick={() => toggleSort('status')}
                  />
                </>
              )}
              {!isPreview && <th className="px-5 py-3 text-right font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map((c) => (
              <tr key={c.id} className="hover:bg-muted/40">
                <td className="px-5 py-3 font-medium text-foreground">{c.name}</td>
                <td className="px-5 py-3">
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                    {c.plan ? (PLAN_LABELS[c.plan] ?? c.plan) : '—'}
                  </span>
                </td>
                {!isPreview && (
                  <>
                    <td className="px-5 py-3 text-foreground">{c.gestionnaireCount}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {DATE_FORMATTER.format(new Date(c.createdAt))}
                    </td>
                  </>
                )}
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      STATUS_BADGE[displayStatus(c)] ?? ''
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                    {STATUS_LABEL[displayStatus(c)] ?? displayStatus(c)}
                  </span>
                </td>
                {!isPreview && (
                  <td className="px-5 py-3 text-right">
                    {c.deletedAt ? (
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-xs text-muted-foreground">
                          Purge le {DATE_FORMATTER.format(purgeDate(c.deletedAt))}
                        </span>
                        <button
                          type="button"
                          onClick={() => restoreCabinet(c.id)}
                          disabled={loadingId === c.id}
                          className="rounded-lg border border-secondary/40 px-3 py-1.5 text-xs font-semibold text-secondary transition hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loadingId === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            'Restaurer'
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        {c.status === 'suspendu' ? (
                          <button
                            type="button"
                            onClick={() => updateStatus(c.id, 'actif')}
                            disabled={loadingId === c.id}
                            className="rounded-lg border border-secondary/40 px-3 py-1.5 text-xs font-semibold text-secondary transition hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {loadingId === c.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              'Réactiver'
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPendingCabinet(c)}
                            disabled={loadingId === c.id}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Suspendre
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPendingArchiveCabinet(c)}
                          disabled={loadingId === c.id}
                          title="Archiver"
                          aria-label={`Archiver ${c.name}`}
                          className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={isPreview ? 3 : 6}
                  className="px-5 py-8 text-center text-sm text-muted-foreground"
                >
                  {isPreview
                    ? 'Aucun cabinet pour le moment.'
                    : 'Aucun cabinet ne correspond à cette recherche.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted-foreground">
        <span>
          {isPreview
            ? `${paginated.length} sur ${cabinets.length} cabinet${cabinets.length > 1 ? 's' : ''}`
            : `${filtered.length} cabinet${filtered.length > 1 ? 's' : ''}${pageCount > 1 ? ` — page ${currentPage} sur ${pageCount}` : ''}`}
        </span>
        {!isPreview && pageCount > 1 && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-border px-3 py-1 transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Précédent
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage === pageCount}
              className="rounded-lg border border-border px-3 py-1 transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Suivant
            </button>
          </div>
        )}
      </div>

      {pendingCabinet && (
        <ConfirmDialog
          title="Suspendre ce cabinet ?"
          description={`Le cabinet « ${pendingCabinet.name} » et ses utilisateurs perdront l'accès immédiatement. Cette action est réversible.`}
          confirmLabel="Suspendre"
          loading={loadingId === pendingCabinet.id}
          onCancel={() => setPendingCabinet(null)}
          onConfirm={() => updateStatus(pendingCabinet.id, 'suspendu')}
        />
      )}

      {pendingArchiveCabinet && (
        <ConfirmDialog
          title="Archiver ce cabinet ?"
          description={`Le cabinet « ${pendingArchiveCabinet.name} » et ses utilisateurs perdront l'accès immédiatement. Les données seront définitivement supprimées dans ${CABINET_DELETION_RETENTION_DAYS} jours (restauration possible avant cette échéance).`}
          confirmLabel="Archiver"
          loading={loadingId === pendingArchiveCabinet.id}
          onCancel={() => setPendingArchiveCabinet(null)}
          onConfirm={() => archiveCabinet(pendingArchiveCabinet.id)}
        />
      )}
    </section>
  );
}
