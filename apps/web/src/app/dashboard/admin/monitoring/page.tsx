import type { Metadata } from 'next';
import { Building2, ShieldAlert } from 'lucide-react';
import { getMonitoringData } from '@/lib/admin-data';
import { MonitoringSummary } from '@/components/admin/monitoring-summary';

export const metadata: Metadata = {
  title: 'Monitoring — Console SuperAdmin',
  description: 'Santé de la plateforme SocialFlow.',
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('fr-BE', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function StatusBar({ label, actif, suspendu, archive }: { label: string; actif: number; suspendu: number; archive: number }) {
  const total = actif + suspendu + archive;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">{total} au total</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {total > 0 && (
          <>
            <div className="bg-secondary" style={{ width: `${(actif / total) * 100}%` }} />
            <div className="bg-destructive" style={{ width: `${(suspendu / total) * 100}%` }} />
            <div className="bg-muted-foreground/40" style={{ width: `${(archive / total) * 100}%` }} />
          </>
        )}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-secondary" /> {actif} actif{actif > 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-destructive" /> {suspendu} suspendu{suspendu > 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> {archive} archivé{archive > 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

export default async function AdminMonitoringPage() {
  const data = await getMonitoringData();

  return (
    <>
      {/* ===== Sante DB + sessions actives ===== */}
      <MonitoringSummary data={data} />

      {/* ===== Repartition par statut ===== */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
          <Building2 className="h-4 w-4" /> Répartition par statut
        </h2>
        <div className="space-y-6">
          <StatusBar label="Cabinets" {...data.cabinetsByStatus} />
          <StatusBar label="Utilisateurs" {...data.usersByStatus} />
        </div>
      </section>

      {/* ===== Tentatives de connexion limitees ===== */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
          <ShieldAlert className="h-4 w-4" /> Tentatives de connexion limitées récemment
        </h2>
        {data.rateLimitHits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune tentative bloquée récemment.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.rateLimitHits.map((hit) => (
              <li
                key={hit.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
              >
                <span className="truncate font-mono text-xs text-muted-foreground">{hit.key}</span>
                <span className="shrink-0 text-foreground">{hit.count} requêtes</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {DATE_TIME_FORMATTER.format(new Date(hit.lastRequest))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
