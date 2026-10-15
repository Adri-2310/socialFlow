import { Check, CreditCard, FileText } from 'lucide-react';
import {
  CancelSubscriptionButton,
  CardUpdateButton,
  ResumeSubscriptionButton,
} from '@/components/cabinet/subscription-actions';
import { PlanChange } from '@/components/cabinet/plan-change';
import { BILLING_STATUS_LABELS, trialDaysLeft } from '@/lib/billing';
import type { CabinetSubscriptionDetails } from '@/lib/cabinet-billing';
import type { BillingExtras } from '@/lib/cabinet-subscription';
import type { PlanChangeOptions } from '@/lib/plan-change';

// Retour de la saisie de carte chez Stripe (voir la page Mon abonnement).
export type CardFlash = 'ok' | 'annulee' | 'erreur' | null;

const FLASH_MESSAGES: Record<
  Exclude<CardFlash, null>,
  { tone: 'ok' | 'info' | 'error'; text: string }
> = {
  ok: { tone: 'ok', text: 'Votre carte bancaire a été mise à jour.' },
  annulee: { tone: 'info', text: 'Aucune modification : votre carte n’a pas été changée.' },
  erreur: {
    tone: 'error',
    text: 'La mise à jour de votre carte n’a pas pu être confirmée. Réessayez ou contactez le support.',
  },
};

const INVOICE_STATUS: Record<string, string> = {
  paid: 'Payée',
  open: 'À payer',
  uncollectible: 'Impayée',
  void: 'Annulée',
};

const PERIOD_LABELS = { monthly: 'Mensuelle', yearly: 'Annuelle' } as const;

const formatDate = (date: Date) =>
  date.toLocaleDateString('fr-BE', { timeZone: 'Europe/Brussels', dateStyle: 'long' });

// Montants entiers en centimes (CLAUDE.md) ; formates en euros a l'affichage.
const formatEuros = (cents: number) =>
  new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

// Ce que le cabinet doit savoir de son echeance, selon l'etat (D55, D57, D59).
function statusMessage(data: CabinetSubscriptionDetails): string {
  const amount = data.amountCents !== null ? formatEuros(data.amountCents) : null;

  if (data.cancelAtPeriodEnd && (data.status === 'ESSAI' || data.status === 'ACTIF')) {
    const end = data.currentPeriodEnd ?? data.trialEndsAt;
    return end
      ? `Résiliation programmée : vous gardez l’accès jusqu’au ${formatDate(end)}, sans nouveau paiement.`
      : 'Résiliation programmée : vous gardez l’accès jusqu’à la fin de la période, sans nouveau paiement.';
  }

  switch (data.status) {
    case 'ESSAI': {
      const days = trialDaysLeft(data.trialEndsAt);
      const until = data.trialEndsAt ? ` jusqu’au ${formatDate(data.trialEndsAt)}` : '';
      const left =
        days !== null ? ` (${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''})` : '';
      const first = amount ? ` Premier paiement de ${amount} à la fin de l’essai.` : '';
      return `Essai gratuit${until}${left}.${first}`;
    }
    case 'ACTIF':
      return data.currentPeriodEnd
        ? `Prochain paiement${amount ? ` de ${amount}` : ''} le ${formatDate(data.currentPeriodEnd)}.`
        : 'Abonnement en règle.';
    case 'DELAI_GRACE':
      return data.graceEndsAt
        ? `Le dernier paiement a échoué. Régularisez avant le ${formatDate(data.graceEndsAt)} pour éviter le passage en lecture seule.`
        : 'Le dernier paiement a échoué. Régularisez pour éviter le passage en lecture seule.';
    case 'IMPAYE':
      return 'Cabinet en lecture seule pour impayé. Mettez à jour votre carte pour reprendre l’activité.';
    case 'RESILIE':
      return 'Abonnement résilié : votre cabinet est en lecture seule.';
    default:
      return 'Le paiement de votre abonnement n’est pas encore finalisé.';
  }
}

const STATUS_TONE: Record<string, string> = {
  ACTIF: 'bg-secondary/15 text-secondary',
  ESSAI: 'bg-primary/10 text-primary',
  DELAI_GRACE: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  IMPAYE: 'bg-destructive/10 text-destructive-text',
  RESILIE: 'bg-muted text-muted-foreground',
};

// Page "Mon abonnement" du Cabinet RH : la gestion se fait dans SocialFlow, sans
// portail Stripe (D59). Seule la saisie d'une carte passe par une page Stripe.
// Les actions (carte, resiliation, reprise) sont dans subscription-actions.
export function SubscriptionDetails({
  data,
  extras,
  planChange,
  flash = null,
}: {
  data: CabinetSubscriptionDetails;
  extras: BillingExtras;
  planChange: PlanChangeOptions;
  flash?: CardFlash;
}) {
  // L'acces dure jusqu'a la fin de la periode en cours (D59).
  const accessEnd = data.currentPeriodEnd ?? data.trialEndsAt;
  const accessEndLabel = accessEnd ? formatDate(accessEnd) : null;
  const cancellable = ['ESSAI', 'ACTIF', 'DELAI_GRACE'].includes(data.status);
  const flashMessage = flash ? FLASH_MESSAGES[flash] : null;

  const price =
    data.amountCents === null || data.billingPeriod === null
      ? null
      : data.billingPeriod === 'yearly'
        ? `${formatEuros(data.amountCents)} par an`
        : `${formatEuros(data.amountCents)} par mois`;

  return (
    <div className="space-y-6">
      {flashMessage && (
        <p
          role="status"
          className={`rounded-xl border p-3 text-sm ${
            flashMessage.tone === 'ok'
              ? 'border-secondary/30 bg-secondary/10 text-foreground'
              : flashMessage.tone === 'error'
                ? 'border-destructive/30 bg-destructive/10 text-destructive-text'
                : 'border-border bg-muted/60 text-foreground'
          }`}
        >
          {flashMessage.text}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <CreditCard className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Votre abonnement
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                {data.planName ?? 'Aucun plan'}
              </h2>
              {data.planDescription && (
                <p className="text-sm text-muted-foreground">{data.planDescription}</p>
              )}
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              STATUS_TONE[data.status] ?? 'bg-muted text-muted-foreground'
            }`}
          >
            {BILLING_STATUS_LABELS[data.status]}
          </span>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Facturation</dt>
            <dd className="text-sm font-semibold text-foreground">
              {data.billingPeriod ? PERIOD_LABELS[data.billingPeriod] : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Montant</dt>
            <dd className="text-sm font-semibold text-foreground">{price ?? '—'}</dd>
            {data.monthlyEquivalentCents !== null && (
              <p className="text-xs text-muted-foreground">
                soit {formatEuros(data.monthlyEquivalentCents)} par mois, facturé une fois par an
              </p>
            )}
          </div>
        </dl>

        <p className="mt-5 rounded-xl bg-muted/60 p-3 text-sm text-foreground/90">
          {statusMessage(data)}
        </p>

        {cancellable && (
          <div className="mt-5">
            {data.cancelAtPeriodEnd && data.status !== 'DELAI_GRACE' ? (
              <ResumeSubscriptionButton />
            ) : (
              <CancelSubscriptionButton endDateLabel={accessEndLabel} />
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-sm font-bold text-foreground">Moyen de paiement</h2>
        {!extras.available ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Le service de paiement est momentanément indisponible. Réessayez dans un instant.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-foreground">
              {extras.card ? (
                <>
                  <span className="font-semibold capitalize">{extras.card.brand}</span> ····{' '}
                  {extras.card.last4}
                  <span className="text-muted-foreground">
                    {' '}
                    · expire {String(extras.card.expMonth).padStart(2, '0')}/{extras.card.expYear}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Aucune carte enregistrée.</span>
              )}
            </p>
            <div className="mt-3">
              <CardUpdateButton label={extras.card ? 'Modifier ma carte' : 'Ajouter une carte'} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              La saisie se fait sur une page sécurisée de Stripe : SocialFlow ne voit jamais votre
              numéro de carte. Votre carte actuelle est remplacée, jamais supprimée.
            </p>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-sm font-bold text-foreground">Factures</h2>
        {!extras.available ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Les factures sont momentanément indisponibles.
          </p>
        ) : extras.invoices.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Aucune facture pour le moment. La première est émise à la fin de l’essai.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Numéro</th>
                  <th className="py-2 pr-4 font-medium">Montant</th>
                  <th className="py-2 pr-4 font-medium">Statut</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Télécharger</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {extras.invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-border">
                    <td className="whitespace-nowrap py-2 pr-4">{formatDate(invoice.date)}</td>
                    <td className="py-2 pr-4">{invoice.number ?? '—'}</td>
                    <td className="whitespace-nowrap py-2 pr-4 font-medium">
                      {formatEuros(invoice.amountCents)}
                    </td>
                    <td className="py-2 pr-4">{INVOICE_STATUS[invoice.status] ?? invoice.status}</td>
                    <td className="py-2 text-right">
                      {invoice.pdfUrl && (
                        <a
                          href={invoice.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.features.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-sm font-bold text-foreground">Inclus dans votre plan</h2>
          <ul className="mt-4 grid gap-2 text-sm text-foreground sm:grid-cols-2">
            {data.features.map((feature) => (
              <li key={feature} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                {feature}
              </li>
            ))}
          </ul>
        </section>
      )}

      <PlanChange
        options={planChange}
        pending={extras.pendingChange}
        effectiveAtLabel={accessEndLabel}
      />
    </div>
  );
}
