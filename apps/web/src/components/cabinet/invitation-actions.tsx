'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCw, Ban } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { InvitationStatus } from '@/lib/cabinet-data';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Vous n'êtes pas autorisé à effectuer cette action.",
  INVITATION_NOT_FOUND: 'Cette invitation est introuvable.',
  INVITATION_ALREADY_ACCEPTED: 'Cette invitation a déjà été acceptée.',
  INVITATION_ALREADY_REVOKED: 'Cette invitation a déjà été révoquée.',
  EMAIL_ALREADY_USED: 'Un compte existe déjà avec cette adresse email.',
  EMAIL_SEND_FAILED: "L'email n'a pas pu être envoyé. Réessayez dans un instant.",
};

// Actions d'une ligne d'invitation (roles/02-cabinet-rh.md § 4.2) : renvoyer
// (pending ou expiree) et revoquer (pending). Les autres statuts sont
// terminaux et n'offrent aucune action.
export function InvitationActions({
  invitationId,
  email,
  status,
}: {
  invitationId: string;
  email: string;
  status: InvitationStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'resend' | 'revoke' | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== 'pending' && status !== 'expired') return null;

  async function call(kind: 'resend' | 'revoke') {
    setError(null);
    setBusy(kind);

    const res =
      kind === 'resend'
        ? await fetch(`/api/invitations/${invitationId}/resend`, { method: 'POST' })
        : await fetch(`/api/invitations/${invitationId}`, { method: 'DELETE' });

    setBusy(null);
    setConfirmRevoke(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(ERROR_MESSAGES[body?.error] ?? 'Une erreur est survenue. Veuillez réessayer.');
      return;
    }

    // Recharge les donnees serveur : statut, echeance, compteurs.
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:shrink-0 sm:items-end">
      <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-1">
        <button
          type="button"
          onClick={() => call('resend')}
          disabled={busy !== null}
          aria-label={`Renvoyer l'invitation à ${email}`}
          className="flex items-center gap-1.5 rounded-lg border border-input min-h-10 px-3 py-2 sm:min-h-0 sm:px-2.5 sm:py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === 'resend' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
          Renvoyer
        </button>
        {status === 'pending' && (
          <button
            type="button"
            onClick={() => setConfirmRevoke(true)}
            disabled={busy !== null}
            aria-label={`Révoquer l'invitation de ${email}`}
            className="flex items-center gap-1.5 rounded-lg border border-input min-h-10 px-3 py-2 sm:min-h-0 sm:px-2.5 sm:py-1.5 text-xs font-semibold text-destructive-text transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Ban className="h-3.5 w-3.5" />
            Révoquer
          </button>
        )}
      </div>
      {error && <p className="max-w-xs text-left sm:text-right text-xs text-destructive-text">{error}</p>}

      {confirmRevoke && (
        <ConfirmDialog
          title="Révoquer cette invitation ?"
          description={`Le lien envoyé à ${email} cessera immédiatement de fonctionner.`}
          confirmLabel="Révoquer"
          loading={busy === 'revoke'}
          onCancel={() => setConfirmRevoke(false)}
          onConfirm={() => call('revoke')}
        />
      )}
    </div>
  );
}
