'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, UserPlus } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: 'Adresse email invalide.',
  EMAIL_ALREADY_USED: 'Un compte existe déjà avec cette adresse email.',
  INVITATION_ALREADY_PENDING: 'Une invitation est déjà en attente pour cette adresse ou cette entreprise.',
  ENTREPRISE_ALREADY_HAS_ADMIN: 'Cette entreprise a déjà un administrateur.',
  ENTREPRISE_HAS_NO_ADMIN: 'Cette entreprise n’a pas d’administrateur à remplacer.',
  ENTREPRISE_NOT_FOUND: 'Cette entreprise est introuvable.',
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Vous n'êtes pas autorisé à inviter un administrateur.",
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
};

// Invitation de l'administrateur d'une entreprise (D4, D5) : un seul par
// entreprise, le serveur reste seul juge (409 s'il en existe deja un).
// `replace` (D78) : invite le remplacant ; l'administrateur actuel reste actif jusqu'a
// l'acceptation, puis il est desactive automatiquement.
export function EntrepriseAdminInvite({
  entrepriseId,
  name,
  defaultEmail,
  readOnly,
  replace = false,
}: {
  entrepriseId: string;
  name: string;
  // Email de contact de l'entreprise, propose par defaut.
  defaultEmail: string;
  readOnly: boolean;
  replace?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch(`/api/cabinet/entreprises/${entrepriseId}/admin-invitation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(replace ? { email, replace: true } : { email }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(ERROR_MESSAGES[body?.error] ?? 'Une erreur est survenue. Veuillez réessayer.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setOpen(true)}
        aria-label={replace ? `Remplacer l'administrateur de ${name}` : `Inviter l'administrateur de ${name}`}
        className="flex min-h-10 items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:px-2.5 sm:py-1.5"
      >
        <UserPlus className="h-3.5 w-3.5" />
        {replace ? 'Remplacer' : 'Inviter l’administrateur'}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label={replace ? `Email du remplaçant de l'administrateur de ${name}` : `Email de l'administrateur de ${name}`}
            placeholder="admin@entreprise.be"
            className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Envoyer l’invitation
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            className="rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted"
          >
            Annuler
          </button>
        </div>
      </div>
      {replace && (
        <p className="text-xs text-muted-foreground">
          L’administrateur actuel garde son accès jusqu’à ce que le remplaçant accepte l’invitation, puis il est désactivé.
        </p>
      )}
      {error && <p className="text-sm text-destructive-text">{error}</p>}
    </form>
  );
}
