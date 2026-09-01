import type { Metadata } from 'next';
import { Euro } from 'lucide-react';
import { getBillingData } from '@/lib/admin-data';

export const metadata: Metadata = {
  title: 'Facturation — Console SuperAdmin',
  description: 'Abonnements et revenus reels de la plateforme SocialFlow (Stripe).',
};

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const INTERVAL_LABELS: Record<string, string> = {
  month: '/ mois',
  year: '/ an',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  trialing: 'Essai',
  past_due: 'Paiement en retard',
  canceled: 'Annulé',
  unpaid: 'Impayé',
  incomplete: 'Incomplet',
  incomplete_expired: 'Expiré',
  paused: 'En pause',
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-secondary/10 text-secondary',
  trialing: 'bg-primary/10 text-primary',
  past_due: 'bg-destructive/10 text-destructive',
  unpaid: 'bg-destructive/10 text-destructive',
  canceled: 'bg-muted text-muted-foreground',
  incomplete: 'bg-muted text-muted-foreground',
  incomplete_expired: 'bg-muted text-muted-foreground',
  paused: 'bg-muted text-muted-foreground',
};

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' });
const AMOUNT_FORMATTER = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export default async function AdminFacturationPage() {
  const { rows, mrr } = await getBillingData();

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
      <section className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold text-foreground">Abonnements</h2>
          <p className="text-sm text-muted-foreground">
            Donnees reelles Stripe (mode sandbox/test) — un cabinet sans abonnement Stripe n&apos;apparait pas ici.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-semibold">Cabinet</th>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Montant</th>
                <th className="px-5 py-3 font-semibold">Prochaine échéance</th>
                <th className="px-5 py-3 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.cabinetId} className="hover:bg-muted/40">
                  <td className="px-5 py-3 font-medium text-foreground">{row.cabinetName}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                      {row.planLabel ? (PLAN_LABELS[row.planLabel] ?? row.planLabel) : '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-foreground">
                    {AMOUNT_FORMATTER.format(row.amount)}
                    {row.interval && (
                      <span className="text-muted-foreground"> {INTERVAL_LABELS[row.interval] ?? ''}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {row.currentPeriodEnd ? DATE_FORMATTER.format(new Date(row.currentPeriodEnd)) : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        STATUS_BADGE[row.status] ?? 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Aucun abonnement Stripe pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
