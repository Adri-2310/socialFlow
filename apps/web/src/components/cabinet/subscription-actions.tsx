'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Seul le titulaire du cabinet peut gérer l'abonnement.",
  NO_STRIPE_CUSTOMER: "Aucun abonnement n'est encore démarré pour ce cabinet.",
  NO_SUBSCRIPTION: "Aucun abonnement en cours n'a été trouvé.",
  ALREADY_CANCELLING: 'La résiliation est déjà programmée.',
  NOT_CANCELLING: "Aucune résiliation n'est programmée.",
  STRIPE_FAILED:
    'Le service de paiement est momentanément indisponible. Réessayez dans un instant.',
};

const FALLBACK = 'Une erreur est survenue. Veuillez réessayer.';

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 text-xs text-destructive-text">
      {message}
    </p>
  );
}

// Envoie une action au serveur ; ne transmet rien d'autre que la demande :
// le cabinet vient de la session.
async function post(
  url: string,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { method: 'POST' });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: ERROR_MESSAGES[body?.error] ?? FALLBACK };
    return { ok: true, body: body ?? {} };
  } catch {
    return { ok: false, message: FALLBACK };
  }
}

// Saisie d'une nouvelle carte : page hebergee par Stripe, le numero ne passe
// jamais par SocialFlow. Une carte n'est jamais supprimee, seulement remplacee.
export function CardUpdateButton({ label = 'Modifier ma carte' }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setLoading(true);
    const result = await post('/api/billing/card');
    if (!result.ok || typeof result.body.url !== 'string') {
      setError(result.ok ? FALLBACK : result.message);
      setLoading(false);
      return;
    }
    window.location.assign(result.body.url);
  }

  return (
    <div>
      <Button type="button" variant="outline" onClick={start} disabled={loading}>
        {loading ? <Spinner /> : <CreditCard aria-hidden="true" />}
        {label}
      </Button>
      <ErrorText message={error} />
    </div>
  );
}

// Resiliation en fin de periode, avec une confirmation explicite : l'acces
// reste ouvert jusqu'au terme, mais l'abonnement ne sera pas renouvele.
export function CancelSubscriptionButton({ endDateLabel }: { endDateLabel: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setError(null);
    setLoading(true);
    const result = await post('/api/billing/subscription/cancel');
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
      >
        Résilier mon abonnement
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-semibold text-foreground">Résilier votre abonnement ?</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {endDateLabel
          ? `Vous gardez l’accès à SocialFlow jusqu’au ${endDateLabel}. Ensuite, votre cabinet passera en lecture seule et ne sera plus facturé.`
          : 'Vous gardez l’accès jusqu’à la fin de la période en cours. Ensuite, votre cabinet passera en lecture seule et ne sera plus facturé.'}{' '}
        Vous pourrez annuler la résiliation avant cette date.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="destructive" onClick={cancel} disabled={loading}>
          {loading && <Spinner />}
          Confirmer la résiliation
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirming(false)}
          disabled={loading}
        >
          Conserver mon abonnement
        </Button>
      </div>
      <ErrorText message={error} />
    </div>
  );
}

export function ResumeSubscriptionButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resume() {
    setError(null);
    setLoading(true);
    const result = await post('/api/billing/subscription/resume');
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <Button type="button" onClick={resume} disabled={loading}>
        {loading && <Spinner />}
        Reprendre mon abonnement
      </Button>
      <ErrorText message={error} />
    </div>
  );
}
