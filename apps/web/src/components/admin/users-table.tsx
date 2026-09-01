'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, ChevronUp, ChevronDown, Archive } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/account-retention';

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  cabinetName: string | null;
  createdAt: string;
  deletedAt: string | null;
};

type SortKey = 'name' | 'email' | 'role' | 'cabinetName' | 'createdAt' | 'status';
type SortDirection = 'asc' | 'desc';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'SuperAdmin',
  CABINET_RH: 'Cabinet RH',
  GESTIONNAIRE_RH: 'Gestionnaire RH',
  ENTREPRISE_CLIENTE: 'Entreprise cliente',
  COLLABORATEUR: 'Collaborateur',
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

// Statut affiche : l'archivage (deletedAt) est un etat terminal qui prime sur
// le statut actif/suspendu sous-jacent (inchange en base, voir
// api/admin/users/[id]/route.ts) - meme convention que cabinets-table.tsx.
function displayStatus(u: UserRow): string {
  return u.deletedAt ? 'archive' : u.status;
}

function purgeDate(deletedAt: string): Date {
  return new Date(
    new Date(deletedAt).getTime() + ACCOUNT_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
}

const DEFAULT_SORT_DIRECTION: Record<SortKey, SortDirection> = {
  name: 'asc',
  email: 'asc',
  role: 'asc',
  cabinetName: 'asc',
  status: 'asc',
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

export function UsersTable({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [pendingArchiveUser, setPendingArchiveUser] = useState<UserRow | null>(null);
  const [pendingSuspendUser, setPendingSuspendUser] = useState<UserRow | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || displayStatus(u) === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'email':
          return a.email.localeCompare(b.email) * dir;
        case 'role':
          return (ROLE_LABELS[a.role] ?? a.role).localeCompare(ROLE_LABELS[b.role] ?? b.role) * dir;
        case 'cabinetName':
          return (a.cabinetName ?? '').localeCompare(b.cabinetName ?? '') * dir;
        case 'status':
          return displayStatus(a).localeCompare(displayStatus(b)) * dir;
        case 'createdAt':
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
        default:
          return 0;
      }
    });
  }, [filtered, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginated = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateRoleFilter(value: string) {
    setRoleFilter(value);
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
      const res = await fetch(`/api/admin/users/${id}`, {
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
      setPendingSuspendUser(null);
    }
  }

  async function archiveUser(id: string) {
    setLoadingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('request_failed');
      router.refresh();
    } catch {
      setError('Une erreur est survenue. Réessayez.');
    } finally {
      setLoadingId(null);
      setPendingArchiveUser(null);
    }
  }

  async function restoreUser(id: string) {
    setLoadingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'PUT' });
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
          <h2 className="font-semibold text-foreground">Utilisateurs</h2>
          <p className="text-sm text-muted-foreground">
            Tous les comptes de la plateforme, tous cabinets confondus.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Rechercher un nom ou un email…"
              className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 sm:w-64"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => updateRoleFilter(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
          >
            <option value="all">Tous les rôles</option>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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
      </div>

      {error && <p className="px-5 pt-3 text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <SortableHeader
                label="Nom"
                active={sortKey === 'name'}
                direction={sortDirection}
                onClick={() => toggleSort('name')}
              />
              <SortableHeader
                label="Email"
                active={sortKey === 'email'}
                direction={sortDirection}
                onClick={() => toggleSort('email')}
              />
              <SortableHeader
                label="Rôle"
                active={sortKey === 'role'}
                direction={sortDirection}
                onClick={() => toggleSort('role')}
              />
              <SortableHeader
                label="Cabinet"
                active={sortKey === 'cabinetName'}
                direction={sortDirection}
                onClick={() => toggleSort('cabinetName')}
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
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map((u) => (
              <tr key={u.id} className="hover:bg-muted/40">
                <td className="px-5 py-3 font-medium text-foreground">{u.name}</td>
                <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-5 py-3">
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{u.cabinetName ?? '—'}</td>
                <td className="px-5 py-3 text-muted-foreground">
                  {DATE_FORMATTER.format(new Date(u.createdAt))}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      STATUS_BADGE[displayStatus(u)] ?? ''
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                    {STATUS_LABEL[displayStatus(u)] ?? displayStatus(u)}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  {u.role === 'SUPER_ADMIN' ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : u.deletedAt ? (
                    <div className="flex items-center justify-end gap-3">
                      <span className="text-xs text-muted-foreground">
                        Purge le {DATE_FORMATTER.format(purgeDate(u.deletedAt))}
                      </span>
                      <button
                        type="button"
                        onClick={() => restoreUser(u.id)}
                        disabled={loadingId === u.id}
                        className="rounded-lg border border-secondary/40 px-3 py-1.5 text-xs font-semibold text-secondary transition hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loadingId === u.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          'Restaurer'
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      {u.status === 'suspendu' ? (
                        <button
                          type="button"
                          onClick={() => updateStatus(u.id, 'actif')}
                          disabled={loadingId === u.id}
                          className="rounded-lg border border-secondary/40 px-3 py-1.5 text-xs font-semibold text-secondary transition hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loadingId === u.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            'Réactiver'
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingSuspendUser(u)}
                          disabled={loadingId === u.id}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Suspendre
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPendingArchiveUser(u)}
                        disabled={loadingId === u.id}
                        title="Archiver"
                        aria-label={`Archiver ${u.name}`}
                        className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Aucun utilisateur ne correspond à cette recherche.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted-foreground">
        <span>
          {filtered.length} utilisateur{filtered.length > 1 ? 's' : ''}
          {pageCount > 1 ? ` — page ${currentPage} sur ${pageCount}` : ''}
        </span>
        {pageCount > 1 && (
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

      {pendingSuspendUser && (
        <ConfirmDialog
          title="Suspendre cet utilisateur ?"
          description={`« ${pendingSuspendUser.name} » perdra l'accès immédiatement. Cette action est réversible.`}
          confirmLabel="Suspendre"
          loading={loadingId === pendingSuspendUser.id}
          onCancel={() => setPendingSuspendUser(null)}
          onConfirm={() => updateStatus(pendingSuspendUser.id, 'suspendu')}
        />
      )}

      {pendingArchiveUser && (
        <ConfirmDialog
          title="Archiver cet utilisateur ?"
          description={`« ${pendingArchiveUser.name} » perdra l'accès immédiatement. Les données seront définitivement supprimées dans ${ACCOUNT_DELETION_RETENTION_DAYS} jours (restauration possible avant cette échéance).`}
          confirmLabel="Archiver"
          loading={loadingId === pendingArchiveUser.id}
          onCancel={() => setPendingArchiveUser(null)}
          onConfirm={() => archiveUser(pendingArchiveUser.id)}
        />
      )}
    </section>
  );
}
