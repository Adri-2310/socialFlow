'use client';

import { useState } from 'react';
import { CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { Notice } from '@/components/shared/notice';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Seul le titulaire du cabinet peut démarrer l'abonnement.",
  PLAN_REQUIRED: "Aucun plan n'est associé à votre cabinet. Contactez le support.",
  SUBSCRIPTION_ALREADY_STARTED:
    'Votre abonnement est déjà démarré. Rechargez la page pour accéder à votre espace.',
  PRICE_NOT_FOUND:
    "Ce plan n'est pas disponible à la souscription pour le moment. Contactez le support.",
  CHECKOUT_FAILED:
    'Le service de paiement est momentanément indisponible. Réessayez dans un instant.',
};

type Props = {
  planName: string;
  periodLabel: string;
  // Prix tel que Stripe le facturera, deja formate ; null = indisponible.
  priceLabel: string | null;
  trialDays: number;
  // Retour de Stripe sans paiement (D32) : message d'information.
  cancelled?: boolean;
  // Erreur de confirmation au retour de Stripe (code API).
  confirmError?: string | null;
};

// Ecran "reprendre le paiement" (D32) : le seul acces du titulaire tant que le
// Checkout n'est pas termine. Le plan est celui du cabinet (D55) ; le bouton
// n'envoie rien d'autre qu'une demande de session.
export function PaymentStart({
  planName,
  periodLabel,
  priceLabel,
  trialDays,
  cancelled,
  confirmError,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    confirmError ? (ERROR_MESSAGES[confirmError] ?? ERROR_MESSAGES.CHECKOUT_FAILED) : null,
  );

  async function start() {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' });
      const body = await res.json().catch(() => null);

      if (!res.ok || typeof body?.url !== 'string') {
        setError(ERROR_MESSAGES[body?.error] ?? 'Une erreur est survenue. Veuillez réessayer.');
        setLoading(false);
        return;
      }

      // Page de paiement hebergee par Stripe : on quitte l'application.
      window.location.assign(body.url);
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-5 sm:p-8">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <CreditCard className="h-6 w-6" />
      </span>

      <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground">
        Finalisez votre abonnement
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Votre cabinet est créé. Pour accéder à votre espace, démarrez votre essai gratuit.
      </p>

      {cancelled && (
        <Notice tone="neutral" className="mt-4">
          Le paiement n&apos;a pas été finalisé. Vous pouvez le reprendre quand vous voulez.
        </Notice>
      )}

      <dl className="mt-6 space-y-3 rounded-xl border border-border/60 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="font-semibold text-foreground">{planName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Facturation</dt>
          <dd className="font-semibold text-foreground">{periodLabel}</dd>
        </div>
        {priceLabel && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Prix après l&apos;essai</dt>
            <dd className="font-semibold text-foreground">{priceLabel}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Essai gratuit</dt>
          <dd className="font-semibold text-foreground">{trialDays} jours</dd>
        </div>
      </dl>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Une carte bancaire est demandée pour démarrer l&apos;essai ; elle ne sera débitée qu&apos;à
        la fin des {trialDays} jours. Le paiement est traité par Stripe : SocialFlow ne voit jamais
        votre numéro de carte.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive-text">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Démarrer mon essai gratuit
      </button>
    </div>
  );
}
