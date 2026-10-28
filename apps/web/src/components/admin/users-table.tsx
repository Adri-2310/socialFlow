'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserDialogs, UserRowActions } from '@/components/admin/user-actions';
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

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'SuperAdmin',
  CABINET_RH: 'Cabinet RH',
  GESTIONNAIRE_RH: 'Gestionnaire RH',
  ENTREPRISE_CLIENTE: 'Entreprise cliente',
  COLLABORATEUR: 'Collaborateur',
};

// Statut affiche : l'archivage (deletedAt) est un etat terminal qui prime sur
// le statut actif/suspendu sous-jacent (inchange en base, voir
// api/admin/users/[id]/route.ts) - meme convention que cabinets-table.tsx.
function displayStatus(u: UserRow): string {
  return u.deletedAt ? 'archive' : u.status;
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

const ROLE_FILTERS = [
  { value: 'all', label: 'Tous les rôles' },
  ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
];

const STATUS_FILTERS = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'actif', label: 'Actif' },
  { value: 'suspendu', label: 'Suspendu' },
  { value: 'archive', label: 'Archivé' },
];

const ERROR_MESSAGE = 'Une erreur est survenue. Réessayez.';

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
  const [pendingRevokeUser, setPendingRevokeUser] = useState<UserRow | null>(null);
  const [pendingResetUser, setPendingResetUser] = useState<UserRow | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      setError(ERROR_MESSAGE);
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
      setError(ERROR_MESSAGE);
    } finally {
      setLoadingId(null);
      setPendingArchiveUser(null);
    }
  }

  // D21 : outils de support. Même appel pour les deux, seuls la route et le message changent.
  async function runSupportAction(user: UserRow, action: 'revoke-sessions' | 'reset-password') {
    setLoadingId(user.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error('request_failed');
      setNotice(
        action === 'revoke-sessions'
          ? `Sessions de « ${user.name} » révoquées.`
          : `Lien de réinitialisation demandé pour « ${user.name} » (${user.email}).`,
      );
    } catch {
      setError(ERROR_MESSAGE);
    } finally {
      setLoadingId(null);
      setPendingRevokeUser(null);
      setPendingResetUser(null);
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
      setError(ERROR_MESSAGE);
    } finally {
      setLoadingId(null);
    }
  }

  function sortOf(key: SortKey): DataTableColumn['sort'] {
    return { direction: sortKey === key ? sortDirection : null, onToggle: () => toggleSort(key) };
  }

  const columns: DataTableColumn[] = [
    { key: 'name', header: 'Nom', sort: sortOf('name') },
    { key: 'email', header: 'Email', sort: sortOf('email') },
    { key: 'role', header: 'Rôle', sort: sortOf('role') },
    { key: 'cabinet', header: 'Cabinet', sort: sortOf('cabinetName') },
    { key: 'createdAt', header: 'Créé le', sort: sortOf('createdAt') },
    { key: 'status', header: 'Statut', sort: sortOf('status') },
    { key: 'actions', header: 'Actions', align: 'right' },
  ];

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-foreground">Utilisateurs</h2>
          <p className="text-sm text-muted-foreground">
            Tous les comptes de la plateforme, tous cabinets confondus.
          </p>
        </div>
        <ListFilters
          search={{
            value: search,
            onChange: updateSearch,
            label: 'Rechercher un utilisateur',
            placeholder: 'Rechercher un nom ou un email…',
            className: 'sm:w-64',
          }}
          filters={[
            {
              label: 'Filtrer par rôle',
              value: roleFilter,
              onChange: updateRoleFilter,
              options: ROLE_FILTERS,
            },
            {
              label: 'Filtrer par statut',
              value: statusFilter,
              onChange: updateStatusFilter,
              options: STATUS_FILTERS,
            },
          ]}
        />
      </div>

      {error && (
        <Notice tone="danger" role="alert" className="mx-5 mt-3">
          {error}
        </Notice>
      )}
      {notice && (
        <Notice tone="success" className="mx-5 mt-3">
          {notice}
        </Notice>
      )}

      <DataTable
        caption="Utilisateurs de la plateforme"
        columns={columns}
        isEmpty={filtered.length === 0}
        emptyMessage="Aucun utilisateur ne correspond à cette recherche."
        className="rounded-none border-0 bg-transparent"
      >
        {paginated.map((u) => (
          <TableRow key={u.id}>
            <DataCell className="font-medium text-foreground">{u.name}</DataCell>
            <DataCell className="text-muted-foreground">{u.email}</DataCell>
            <DataCell>
              <Badge variant="secondary" className="h-auto rounded-md px-2 py-0.5">
                {ROLE_LABELS[u.role] ?? u.role}
              </Badge>
            </DataCell>
            <DataCell className="text-muted-foreground">{u.cabinetName ?? '—'}</DataCell>
            <DataCell className="text-muted-foreground">
              {DATE_FORMATTER.format(new Date(u.createdAt))}
            </DataCell>
            <DataCell>
              <StatusBadge domain="compte" status={displayStatus(u)} dot />
            </DataCell>
            <DataCell className="text-right">
              <UserRowActions
                user={u}
                loading={loadingId === u.id}
                onSuspend={() => setPendingSuspendUser(u)}
                onReactivate={() => updateStatus(u.id, 'actif')}
                onRevoke={() => setPendingRevokeUser(u)}
                onReset={() => setPendingResetUser(u)}
                onArchive={() => setPendingArchiveUser(u)}
                onRestore={() => restoreUser(u.id)}
              />
            </DataCell>
          </TableRow>
        ))}
      </DataTable>

      <TablePagination
        page={currentPage}
        pageCount={pageCount}
        onPageChange={setPage}
        className="px-5 py-3"
      >
        {filtered.length} utilisateur{filtered.length > 1 ? 's' : ''}
        {pageCount > 1 ? ` — page ${currentPage} sur ${pageCount}` : ''}
      </TablePagination>

      <UserDialogs
        pendingSuspend={pendingSuspendUser}
        pendingRevoke={pendingRevokeUser}
        pendingReset={pendingResetUser}
        pendingArchive={pendingArchiveUser}
        loadingId={loadingId}
        onCancelSuspend={() => setPendingSuspendUser(null)}
        onCancelRevoke={() => setPendingRevokeUser(null)}
        onCancelReset={() => setPendingResetUser(null)}
        onCancelArchive={() => setPendingArchiveUser(null)}
        onConfirmSuspend={(user) => updateStatus(user.id, 'suspendu')}
        onConfirmRevoke={(user) => runSupportAction(user, 'revoke-sessions')}
        onConfirmReset={(user) => runSupportAction(user, 'reset-password')}
        onConfirmArchive={(user) => archiveUser(user.id)}
      />
    </section>
  );
}
