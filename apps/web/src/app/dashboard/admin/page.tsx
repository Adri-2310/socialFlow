import type { Metadata } from 'next';
import { Building2, Euro, Gauge, AlertTriangle } from 'lucide-react';
import { CabinetsTable } from '@/components/admin/cabinets-table';
import { AuditLogList } from '@/components/admin/audit-log-list';
import { getCabinets, getAuditLogEntries } from '@/lib/admin-data';

export const metadata: Metadata = {
  title: 'Console SuperAdmin — SocialFlow',
  description: 'Supervision de la plateforme SocialFlow.',
};

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const PREVIEW_SIZE = 10;

export default async function AdminPage() {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [{ cabinets, rows }, auditLogs] = await Promise.all([getCabinets(), getAuditLogEntries(PREVIEW_SIZE)]);

  const cabinetsActifs = cabinets.filter((c) => c.status === 'actif' && !c.deletedAt).length;
  const nouveauxCeMois = cabinets.filter((c) => c.createdAt >= startOfMonth).length;

  const planCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.deletedAt) continue;
    const key = row.plan ?? 'aucun';
    planCounts.set(key, (planCounts.get(key) ?? 0) + 1);
  }
  const totalAvecPlan = rows.filter((row) => !row.deletedAt).length;

  return (
    <>
      {/* ===== KPIs ===== */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-semibold text-secondary">
              +{nouveauxCeMois}
            </span>
          </div>
          <p className="mt-4 text-2xl font-bold text-foreground">{cabinetsActifs}</p>
          <p className="text-sm text-muted-foreground">Cabinets actifs</p>
        </div>

        {[
          { icon: Euro, label: 'MRR (revenu mensuel)' },
          { icon: Gauge, label: 'Uptime' },
          { icon: AlertTriangle, label: 'Incidents ouverts' },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                Bientôt disponible
              </span>
            </div>
            <p className="mt-4 text-2xl font-bold text-muted-foreground">—</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </section>

      {/* ===== Répartition des abonnements ===== */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 font-semibold text-foreground">Répartition des abonnements</h2>
        <div className="space-y-3 text-sm">
          {(['starter', 'pro', 'enterprise', 'aucun'] as const).map((planKey) => {
            const count = planCounts.get(planKey) ?? 0;
            if (count === 0) return null;
            return (
              <div key={planKey} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-foreground">
                  <span className="h-3 w-3 rounded-sm bg-primary" />
                  {PLAN_LABELS[planKey] ?? 'Aucun plan'}
                </span>
                <span className="font-semibold text-foreground">{count}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {totalAvecPlan} cabinet{totalAvecPlan > 1 ? 's' : ''} — {nouveauxCeMois} nouveau
          {nouveauxCeMois > 1 ? 'x' : ''} ce mois-ci.
        </p>
      </section>

      {/* ===== Aperçu cabinets (10 premiers, le reste sur /dashboard/admin/cabinets) ===== */}
      <CabinetsTable cabinets={rows} limit={PREVIEW_SIZE} manageHref="/dashboard/admin/cabinets" />

      {/* ===== Aperçu journal d'audit (10 derniers, le reste sur /dashboard/admin/audit) ===== */}
      <AuditLogList logs={auditLogs} limit={PREVIEW_SIZE} manageHref="/dashboard/admin/audit" />
    </>
  );
}
