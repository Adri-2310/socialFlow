'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { formatStorageMb } from '@/lib/billing/quota-format';
import type { QuotaKey } from '@/lib/billing/cabinet-quotas';
import type { PendingPlanChange, PlanChangeOptions, PlanOption } from '@/lib/billing/plan-change';

type Period = 'monthly' | 'yearly';

const PERIOD_LABELS: Record<Period, string> = { monthly: 'Mensuelle', yearly: 'Annuelle' };

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Seul le titulaire du cabinet peut changer l'abonnement.",
  PLAN_CHANGE_NOT_ALLOWED: "Le changement n'est possible que pour un abonnement en règle.",
  RESUME_FIRST: 'Reprenez votre abonnement avant de changer de plan.',
  SAME_PLAN: 'Ce plan et cette périodicité sont déjà ceux de votre abonnement.',
  PLAN_UNAVAILABLE: "Ce plan n'est plus disponible.",
  PRICE_NOT_SET: "Ce plan n'a pas de prix pour cette périodicité.",
  QUOTA_EXCEEDED: "Votre consommation dépasse les limites de ce plan : réduisez-la d'abord.",
  NO_PENDING_CHANGE: "Aucun changement n'est programmé.",
  STRIPE_FAILED: 'Le service de paiement est momentanément indisponible. Réessayez dans un instant.',
};

const FALLBACK = 'Une erreur est survenue. Veuillez réessayer.';

const formatEuros = (cents: number) =>
  new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

const QUOTA_NOUNS: Record<QuotaKey, string> = {
  maxUtilisateurs: 'gestionnaire(s)',
  maxEntreprises: 'entreprise(s) cliente(s)',
  maxStorageMb: 'de stockage',
};

// "Vous avez 12 gestionnaire(s), ce plan en autorise 10 : retirez-en 2."
function blockerMessage(blocker: PlanOption['blockers'][number]): string {
  const isStorage = blocker.quota === 'maxStorageMb';
  const fmt = (value: number) => (isStorage ? formatStorageMb(value) : String(value));
  const noun = QUOTA_NOUNS[blocker.quota];
  return isStorage
    ? `Vous utilisez ${fmt(blocker.used)} de stockage, ce plan en autorise ${fmt(blocker.limit)} : libérez ${fmt(blocker.used - blocker.limit)}.`
    : `Vous avez ${blocker.used} ${noun}, ce plan en autorise ${blocker.limit} : retirez-en ${blocker.used - blocker.limit}.`;
}

function priceOf(plan: PlanOption, period: Period): { total: string; note: string | null } | null {
  if (period === 'monthly') {
    return plan.monthlyCents === null ? null : { total: `${formatEuros(plan.monthlyCents)} / mois`, note: null };
  }
  if (plan.yearlyCents === null) return null;
  return {
    total: `${formatEuros(plan.yearlyCents)} / an`,
    note: `soit ${formatEuros(Math.round(plan.yearlyCents / 12))} par mois, facturé une fois par an`,
  };
}

async function post(url: string, body?: unknown) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false as const, message: ERROR_MESSAGES[data?.error] ?? FALLBACK };
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: FALLBACK };
  }
}

type Props = {
  options: PlanChangeOptions;
  pending: PendingPlanChange | null;
  // Date a laquelle le changement prendrait effet (fin de la periode), deja formatee.
  effectiveAtLabel: string | null;
};

// Changement de plan ou de periodicite (D60) : toujours en fin de periode,
// sans prorata ni remboursement. Les limites du plan vise sont verifiees ici
// pour l'affichage ET par le serveur, qui fait foi.
export function PlanChange({ options, pending, effectiveAtLabel }: Props) {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>(options.currentPeriod ?? 'monthly');
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => ReturnType<typeof post>) {
    setError(null);
    setLoading(true);
    const result = await action();
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSelected(null);
    router.refresh();
  }

  const dateText = effectiveAtLabel ?? 'la fin de la période en cours';

  if (pending) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-sm font-bold text-foreground">Changement de plan programmé</h2>
        <p className="mt-2 text-sm text-foreground">
          Passage à <span className="font-semibold">{pending.planName ?? 'un autre plan'}</span>
          {pending.billingPeriod ? ` (${PERIOD_LABELS[pending.billingPeriod].toLowerCase()})` : ''}
          {pending.amountCents !== null && pending.billingPeriod
            ? ` à ${formatEuros(pending.amountCents)} ${pending.billingPeriod === 'yearly' ? 'par an' : 'par mois'}`
            : ''}
          {pending.effectiveAt
            ? ` le ${pending.effectiveAt.toLocaleDateString('fr-BE', { timeZone: 'Europe/Brussels', dateStyle: 'long' })}`
            : ''}
          . Vous gardez votre plan actuel jusqu’à cette date.
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => run(() => post('/api/billing/plan-change/cancel'))}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Annuler le changement
        </button>
        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive-text">
            {error}
          </p>
        )}
      </section>
    );
  }

  if (!options.canChange) {
    return (
      <section className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">Changer de plan ou de périodicité</p>
        <p className="mt-1">
          {options.reason === 'CANCELLING'
            ? 'Reprenez votre abonnement pour pouvoir changer de plan.'
            : 'Le changement de plan est possible lorsque votre abonnement est en règle.'}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-sm font-bold text-foreground">Changer de plan ou de périodicité</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Le changement prend effet à la fin de la période en cours ({dateText}). Vous gardez votre
        plan actuel jusque-là ; il n’y a ni prorata ni remboursement.
      </p>

      <div role="group" aria-label="Périodicité" className="mt-4 inline-flex rounded-xl border border-border p-1">
        {(['monthly', 'yearly'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={period === value}
            onClick={() => {
              setPeriod(value);
              setSelected(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              period === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {PERIOD_LABELS[value]}
          </button>
        ))}
      </div>

      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {options.plans.map((plan) => {
          const price = priceOf(plan, period);
          const isCurrent = plan.isCurrentPlan && period === options.currentPeriod;
          const blocked = plan.blockers.length > 0;
          const disabled = isCurrent || blocked || !price;

          return (
            <li
              key={plan.planId}
              className={`rounded-xl border p-4 ${isCurrent ? 'border-primary/50 bg-primary/5' : 'border-border'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-foreground">{plan.name}</p>
                {isCurrent && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    <Check className="mr-1 inline h-3 w-3" />
                    Plan actuel
                  </span>
                )}
              </div>
              <p className="mt-2 text-lg font-bold text-foreground">{price?.total ?? '—'}</p>
              {price?.note && <p className="text-xs text-muted-foreground">{price.note}</p>}

              {blocked && (
                <ul className="mt-2 space-y-1">
                  {plan.blockers.map((blocker) => (
                    <li key={blocker.quota} className="text-xs font-medium text-destructive-text">
                      {blockerMessage(blocker)}
                    </li>
                  ))}
                </ul>
              )}

              {selected === plan.planId ? (
                <div className="mt-3 rounded-lg bg-muted/60 p-3">
                  <p className="text-xs text-foreground">
                    Passer à <span className="font-semibold">{plan.name}</span> ({PERIOD_LABELS[period].toLowerCase()}
                    {price ? `, ${price.total}` : ''}) à partir du {dateText}.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        run(() => post('/api/billing/plan-change', { planId: plan.planId, billingPeriod: period }))
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Confirmer
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setSelected(null)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setError(null);
                    setSelected(plan.planId);
                  }}
                  className="mt-3 w-full rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Choisir {plan.name}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive-text">
          {error}
        </p>
      )}
    </section>
  );
}
