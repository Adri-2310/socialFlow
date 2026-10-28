'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: 'Adresse email invalide.',
  EMAIL_ALREADY_USED: 'Un compte existe déjà avec cette adresse email.',
  INVITATION_ALREADY_PENDING:
    'Une invitation est déjà en attente pour cette adresse ou cette entreprise.',
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={readOnly}
        onClick={() => setOpen(true)}
        aria-label={
          replace ? `Remplacer l'administrateur de ${name}` : `Inviter l'administrateur de ${name}`
        }
        className="text-xs"
      >
        <UserPlus />
        {replace ? 'Remplacer' : 'Inviter l’administrateur'}
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label={
              replace
                ? `Email du remplaçant de l'administrateur de ${name}`
                : `Email de l'administrateur de ${name}`
            }
            placeholder="admin@entreprise.be"
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={loading} className="flex-1 sm:flex-none">
            {loading && <Spinner />}
            Envoyer l’invitation
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            className="text-muted-foreground"
          >
            Annuler
          </Button>
        </div>
      </div>
      {replace && (
        <p className="text-xs text-muted-foreground">
          L’administrateur actuel garde son accès jusqu’à ce que le remplaçant accepte l’invitation,
          puis il est désactivé.
        </p>
      )}
      {error && <p className="text-sm text-destructive-text">{error}</p>}
    </form>
  );
}
