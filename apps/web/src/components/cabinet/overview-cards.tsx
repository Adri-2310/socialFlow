import { Users, MailPlus, Building2, CreditCard } from 'lucide-react';
import type { CabinetOverview } from '@/lib/cabinet-data';
import { BILLING_STATUS_LABELS, trialDaysLeft } from '@/lib/billing';
import Link from 'next/link';

const PERIOD_LABELS = { monthly: 'Facturation mensuelle', yearly: 'Facturation annuelle' } as const;

// Presentation pure (sans etat, sans acces donnees) : recoit un
// CabinetOverview deja calcule, pour rester testable sans base - meme
// principe que MonitoringSummary cote SuperAdmin.
export function OverviewCards({ data }: { data: CabinetOverview }) {
  const { gestionnaires, pendingInvitations, subscription } = data;
  const daysLeft = subscription.status === 'ESSAI' ? trialDaysLeft(subscription.trialEndsAt) : null;

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Users className="h-5 w-5" />
        </span>
        <p className="mt-4 text-2xl font-bold text-foreground">{gestionnaires.total}</p>
        <p className="text-sm text-muted-foreground">
          Gestionnaire{gestionnaires.total > 1 ? 's' : ''} RH
        </p>
        {gestionnaires.suspendus > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            dont {gestionnaires.suspendus} suspendu{gestionnaires.suspendus > 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <MailPlus className="h-5 w-5" />
        </span>
        <p className="mt-4 text-2xl font-bold text-foreground">{pendingInvitations}</p>
        <p className="text-sm text-muted-foreground">
          Invitation{pendingInvitations > 1 ? 's' : ''} en attente
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Building2 className="h-5 w-5" />
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            Bientôt disponible
          </span>
        </div>
        <p className="mt-4 text-2xl font-bold text-muted-foreground">—</p>
        <p className="text-sm text-muted-foreground">Entreprises clientes</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <CreditCard className="h-5 w-5" />
        </span>
        <p className="mt-4 text-2xl font-bold text-foreground">
          {subscription.planName ?? 'Aucun plan'}
        </p>
        <p className="text-sm text-muted-foreground">
          {subscription.billingPeriod ? PERIOD_LABELS[subscription.billingPeriod] : 'Abonnement'}
        </p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          {BILLING_STATUS_LABELS[subscription.status]}
          {daysLeft !== null && ` · ${daysLeft === 0 ? 'se termine aujourd’hui' : `J-${daysLeft}`}`}
        </p>
        {subscription.status !== 'EN_ATTENTE_PAIEMENT' && (
          <Link
            href="/dashboard/cabinet/facturation"
            className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
          >
            Gérer mon abonnement
          </Link>
        )}
      </div>
    </section>
  );
}
