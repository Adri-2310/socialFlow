'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, UserPlus } from 'lucide-react';
import { pendingPlanQuotaMessage, quotaAwareMessage } from '@/lib/billing/quota-messages';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: 'Adresse email invalide.',
  EMAIL_ALREADY_USED: 'Un compte existe déjà avec cette adresse email.',
  INVITATION_ALREADY_PENDING: 'Une invitation est déjà en attente pour cette adresse.',
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
  FORBIDDEN: "Vous n'êtes pas autorisé à inviter un gestionnaire.",
  QUOTA_EXCEEDED:
    "Le quota de gestionnaires de votre plan est atteint. Passez à un plan supérieur pour inviter davantage.",
};

// `quota` (places utilisees / maximum du plan, D15) sert uniquement a
// informer et a eviter un aller-retour inutile : le serveur reste seul juge
// (403 QUOTA_EXCEEDED). Absent (ex. page de profil) = pas d'indication.
export function InviteGestionnaire({
  quota,
}: {
  // `pendingPlan` : plan d'un downgrade programme dont les quotas s'appliquent deja (D75).
  quota?: { used: number; limit: number | null; pendingPlan?: string | null };
}) {
  const router = useRouter();
  const reached = !!quota && quota.limit !== null && quota.used >= quota.limit;
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        quotaAwareMessage(body, ERROR_MESSAGES, 'gestionnaires', 'Une erreur est survenue. Veuillez réessayer.'),
      );
      return;
    }

    setSent(true);
    setEmail('');
    // Rafraichit les donnees serveur de la page (liste des invitations).
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <UserPlus className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Inviter un gestionnaire RH</p>
          <p className="text-xs text-muted-foreground">
            Un email d&apos;invitation lui sera envoyé, valable 7 jours.
            {quota && quota.limit !== null && (
              <>
                {' '}
                <span className="whitespace-nowrap font-medium">
                  {quota.used} / {quota.limit} gestionnaires
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            autoComplete="email"
            required
            disabled={reached}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="gestionnaire@cabinet.be"
            className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-3 text-base text-foreground sm:text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          disabled={loading || reached}
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Inviter
        </button>
      </form>

      {reached && (
        <p className="mt-2 text-sm text-destructive-text">
          {quota?.pendingPlan
            ? pendingPlanQuotaMessage(quota.pendingPlan, 'gestionnaires')
            : ERROR_MESSAGES.QUOTA_EXCEEDED}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-destructive-text">{error}</p>}
      {sent && <p className="mt-2 text-sm text-secondary">Invitation envoyée.</p>}
    </div>
  );
}
