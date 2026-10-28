import { Euro } from 'lucide-react';
import type { BillingRow } from '@/lib/admin/admin-data';
import { DataCell, DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { TableRow } from '@/components/ui/table';

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const INTERVAL_LABELS: Record<string, string> = {
  month: '/ mois',
  year: '/ an',
};

const COLUMNS = [
  { key: 'cabinet', header: 'Cabinet' },
  { key: 'plan', header: 'Plan' },
  { key: 'montant', header: 'Montant' },
  { key: 'echeance', header: 'Prochaine échéance' },
  { key: 'statut', header: 'Statut' },
];

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' });
const AMOUNT_FORMATTER = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Facturation de la plateforme (console SuperAdmin) : MRR et abonnements Stripe. Sans accès aux
// données : la page lui passe ce qu'elle a lu, ce qui le rend testable.
export function FacturationAbonnements({ rows, mrr }: { rows: BillingRow[]; mrr: number }) {
  return (
    <>
      {/* ===== MRR ===== */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Euro className="h-5 w-5" />
          </span>
          <p className="mt-4 text-2xl font-bold text-foreground">{AMOUNT_FORMATTER.format(mrr)}</p>
          <p className="text-sm text-muted-foreground">
            MRR (revenu mensuel récurrent, {rows.filter((r) => r.status === 'active' || r.status === 'trialing').length}{' '}
            abonnement{rows.length > 1 ? 's' : ''} actif{rows.length > 1 ? 's' : ''})
          </p>
        </div>
      </section>

      {/* ===== Abonnements ===== */}
      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-foreground">Abonnements</h2>
          <p className="text-sm text-muted-foreground">
            Donnees reelles Stripe (mode sandbox/test) — un cabinet sans abonnement Stripe n&apos;apparait pas ici.
          </p>
        </div>

        <DataTable
          caption="Abonnements Stripe"
          columns={COLUMNS}
          isEmpty={rows.length === 0}
          emptyMessage="Aucun abonnement Stripe pour le moment."
        >
          {rows.map((row) => (
            <TableRow key={row.cabinetId}>
              <DataCell className="font-medium text-foreground">{row.cabinetName}</DataCell>
              <DataCell>
                <Badge variant="secondary" className="h-auto rounded-md px-2 py-0.5">
                  {row.planLabel ? (PLAN_LABELS[row.planLabel] ?? row.planLabel) : '—'}
                </Badge>
              </DataCell>
              <DataCell className="text-foreground">
                {AMOUNT_FORMATTER.format(row.amount)}
                {row.interval && (
                  <span className="text-muted-foreground"> {INTERVAL_LABELS[row.interval] ?? ''}</span>
                )}
              </DataCell>
              <DataCell className="text-muted-foreground">
                {row.currentPeriodEnd ? DATE_FORMATTER.format(new Date(row.currentPeriodEnd)) : '—'}
              </DataCell>
              <DataCell>
                <StatusBadge domain="stripe" status={row.status} dot />
              </DataCell>
            </TableRow>
          ))}
        </DataTable>
      </section>
    </>
  );
}
