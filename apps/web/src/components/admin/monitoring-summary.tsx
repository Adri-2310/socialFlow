import Link from 'next/link';
import { Database, Users, UserCheck, ArrowRight } from 'lucide-react';
import type { MonitoringData } from '@/lib/admin-data';

// Les 3 cartes reutilisees telles quelles sur /dashboard/admin (apercu, avec
// lien vers la page complete) et /dashboard/admin/monitoring (page complete,
// sans lien puisqu'on y est deja) - meme principe que `limit`/`manageHref`
// sur CabinetsTable/AuditLogList, adapte a un composant sans etat plutot
// qu'une table.
export function MonitoringSummary({
  data,
  manageHref,
}: {
  data: Pick<MonitoringData, 'db' | 'activeSessions' | 'activeUsers'>;
  manageHref?: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Monitoring</h2>
        {manageHref && (
          <Link
            href={manageHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Voir le monitoring complet <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-background p-4">
          <div className="flex items-center justify-between">
            <span
              className={`grid h-9 w-9 place-items-center rounded-lg ${
                data.db.healthy ? 'bg-secondary/10 text-secondary' : 'bg-destructive/10 text-destructive'
              }`}
            >
              <Database className="h-4 w-4" />
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                data.db.healthy ? 'bg-secondary/10 text-secondary' : 'bg-destructive/10 text-destructive'
              }`}
            >
              {data.db.healthy ? 'Opérationnelle' : 'Indisponible'}
            </span>
          </div>
          <p className="mt-3 text-xl font-bold text-foreground">
            {data.db.latencyMs !== null ? `${data.db.latencyMs} ms` : '—'}
          </p>
          <p className="text-sm text-muted-foreground">Latence base de données</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-background p-4">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <UserCheck className="h-4 w-4" />
          </span>
          <p className="mt-3 text-xl font-bold text-foreground">{data.activeUsers}</p>
          <p className="text-sm text-muted-foreground">Utilisateurs actifs</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-background p-4">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </span>
          <p className="mt-3 text-xl font-bold text-foreground">{data.activeSessions}</p>
          <p className="text-sm text-muted-foreground">Sessions actives</p>
        </div>
      </div>
    </section>
  );
}
