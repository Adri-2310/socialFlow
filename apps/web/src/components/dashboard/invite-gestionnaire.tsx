'use client';

import { useState, type SubmitEvent } from 'react';
import { Loader2, Mail, UserPlus } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: 'Adresse email invalide.',
  EMAIL_ALREADY_USED: 'Un compte existe déjà avec cette adresse email.',
  INVITATION_ALREADY_PENDING: 'Une invitation est déjà en attente pour cette adresse.',
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Vous n'êtes pas autorisé à inviter un gestionnaire.",
};

export function InviteGestionnaire() {
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
      setError(ERROR_MESSAGES[body?.error] ?? 'Une erreur est survenue. Veuillez réessayer.');
      return;
    }

    setSent(true);
    setEmail('');
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
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="gestionnaire@cabinet.be"
            className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Inviter
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {sent && <p className="mt-2 text-sm text-secondary">Invitation envoyée.</p>}
    </div>
  );
}
