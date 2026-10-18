import Link from 'next/link';
import { ScrollText } from 'lucide-react';
import { CABINET_AUDIT_ACTIONS, CABINET_AUDIT_ACTION_LIST } from '@/lib/cabinet-audit-labels';
import type {
  AuditUserOption,
  CabinetAuditFilters,
  CabinetAuditPage,
} from '@/lib/cabinet-audit';

// Date et heure formatees separement et jointes explicitement : la sortie
// combinee d'Intl varie selon la version d'ICU, pas celle-ci.
const formatDateTime = (date: Date) => {
  const options = { timeZone: 'Europe/Brussels' } as const;
  const day = date.toLocaleDateString('fr-BE', {
    ...options,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('fr-BE', {
    ...options,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day} à ${time}`;
};

function pageHref(basePath: string, filters: CabinetAuditFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.userId) params.set('user', filters.userId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

const fieldClass =
  'mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:py-2 sm:text-sm';

// Presentation pure du journal d'audit du cabinet (D31) : le filtrage est un
// formulaire GET traite par le serveur (aucun JavaScript necessaire, URL
// partageable), la pagination des liens.
export function CabinetAuditLog({
  data,
  filters,
  users,
  basePath,
}: {
  data: CabinetAuditPage;
  filters: CabinetAuditFilters;
  users: AuditUserOption[];
  basePath: string;
}) {
  const hasFilters = Boolean(filters.action || filters.userId || filters.from || filters.to);

  return (
    <div className="space-y-6">
      <form
        method="GET"
        action={basePath}
        className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4"
      >
        <label className="block text-sm font-medium text-foreground">
          Action
          <select name="action" defaultValue={filters.action ?? ''} className={fieldClass}>
            <option value="">Toutes les actions</option>
            {CABINET_AUDIT_ACTION_LIST.map((action) => (
              <option key={action} value={action}>
                {CABINET_AUDIT_ACTIONS[action]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-foreground">
          Personne
          <select name="user" defaultValue={filters.userId ?? ''} className={fieldClass}>
            <option value="">Toutes les personnes</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-foreground">
          Du
          <input type="date" name="from" defaultValue={filters.from ?? ''} className={fieldClass} />
        </label>

        <label className="block text-sm font-medium text-foreground">
          Au
          <input type="date" name="to" defaultValue={filters.to ?? ''} className={fieldClass} />
        </label>

        <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row lg:col-span-4">
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90"
          >
            Filtrer
          </button>
          {hasFilters && (
            <Link
              href={basePath}
              className="rounded-xl border border-input px-4 py-2.5 text-center text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              Réinitialiser
            </Link>
          )}
        </div>
      </form>

      <section className="rounded-2xl border border-border bg-card">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <h2 className="text-sm font-bold text-foreground">Journal d&apos;audit</h2>
          <p className="text-xs text-muted-foreground">
            {data.total} événement{data.total > 1 ? 's' : ''}
          </p>
        </header>

        {data.entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <ScrollText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? 'Aucun événement ne correspond à ces filtres.'
                : "Aucun événement pour le moment."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{entry.message}</p>
                  {entry.actorLabel && (
                    <p className="text-xs text-muted-foreground">par {entry.actorLabel}</p>
                  )}
                </div>
                <time
                  dateTime={entry.createdAt.toISOString()}
                  className="whitespace-nowrap text-xs text-muted-foreground"
                >
                  {formatDateTime(entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}

        {data.pageCount > 1 && (
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm sm:px-5"
          >
            {data.page > 1 ? (
              <Link
                href={pageHref(basePath, filters, data.page - 1)}
                className="rounded-lg border border-input px-3 py-2 font-semibold text-foreground hover:bg-muted"
              >
                Précédent
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-muted-foreground">
              Page {data.page} sur {data.pageCount}
            </span>
            {data.page < data.pageCount ? (
              <Link
                href={pageHref(basePath, filters, data.page + 1)}
                className="rounded-lg border border-input px-3 py-2 font-semibold text-foreground hover:bg-muted"
              >
                Suivant
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
