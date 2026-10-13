'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, PauseCircle, PlayCircle, UserMinus } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EditEmailDialog } from '@/components/cabinet/edit-email-dialog';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/account-retention';
import { GESTIONNAIRE_RESTORE_WINDOW_DAYS } from '@/lib/gestionnaire-retention';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Vous n'êtes pas autorisé à effectuer cette action.",
  GESTIONNAIRE_NOT_FOUND: 'Ce gestionnaire est introuvable.',
  GESTIONNAIRE_ALREADY_SUSPENDED: 'Ce gestionnaire est déjà suspendu.',
  GESTIONNAIRE_ALREADY_ACTIVE: 'Ce gestionnaire est déjà actif.',
  SUSPENDED_BY_ADMIN:
    "Cette suspension a été décidée par l'administration SocialFlow : seule celle-ci peut la lever.",
};

type Pending = 'suspend' | 'reactivate' | 'archive';

// Actions sur un gestionnaire du cabinet (D52) : suspendre, reactiver,
// archiver. Suspendre et archiver passent par une confirmation (l'acces est
// coupe immediatement et l'utilisateur est prevenu par email).
export function GestionnaireActions({
  gestionnaireId,
  name,
  email,
  status,
  reactivatableByCabinet,
}: {
  gestionnaireId: string;
  name: string;
  email: string;
  status: 'actif' | 'suspendu';
  reactivatableByCabinet: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Pending | null>(null);
  const [confirm, setConfirm] = useState<'suspend' | 'archive' | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Pending) {
    setError(null);
    setBusy(action);

    const url = `/api/gestionnaires/${gestionnaireId}`;
    const res =
      action === 'archive'
        ? await fetch(url, { method: 'DELETE' })
        : await fetch(url, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: action === 'suspend' ? 'suspendu' : 'actif' }),
          });

    setBusy(null);
    setConfirm(null);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(ERROR_MESSAGES[body?.error] ?? 'Une erreur est survenue. Veuillez réessayer.');
      return;
    }

    router.refresh();
  }

  const buttonClass =
    'flex items-center gap-1.5 rounded-lg border border-input min-h-10 px-3 py-2 sm:min-h-0 sm:px-2.5 sm:py-1.5 text-xs font-semibold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="flex flex-col items-start gap-1 sm:shrink-0 sm:items-end">
      <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-1">
        <button
          type="button"
          onClick={() => setEditingEmail(true)}
          disabled={busy !== null}
          aria-label={`Modifier l'email de ${name}`}
          className={`${buttonClass} text-foreground`}
        >
          <Pencil className="h-3.5 w-3.5" />
          Email
        </button>
        {status === 'actif' ? (
          <button
            type="button"
            onClick={() => setConfirm('suspend')}
            disabled={busy !== null}
            aria-label={`Suspendre ${name}`}
            className={`${buttonClass} text-foreground`}
          >
            <PauseCircle className="h-3.5 w-3.5" />
            Suspendre
          </button>
        ) : reactivatableByCabinet ? (
          <button
            type="button"
            onClick={() => run('reactivate')}
            disabled={busy !== null}
            aria-label={`Réactiver ${name}`}
            className={`${buttonClass} text-foreground`}
          >
            {busy === 'reactivate' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5" />
            )}
            Réactiver
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setConfirm('archive')}
          disabled={busy !== null}
          aria-label={`Retirer ${name}`}
          className={`${buttonClass} text-destructive hover:bg-destructive/10`}
        >
          <UserMinus className="h-3.5 w-3.5" />
          Retirer
        </button>
      </div>
      {status === 'suspendu' && !reactivatableByCabinet && (
        <p className="max-w-xs text-left sm:text-right text-xs text-muted-foreground">
          Suspendu par l&apos;administration SocialFlow.
        </p>
      )}
      {error && <p className="max-w-xs text-left sm:text-right text-xs text-destructive">{error}</p>}

      {editingEmail && (
        <EditEmailDialog
          gestionnaireId={gestionnaireId}
          name={name}
          currentEmail={email}
          onClose={() => setEditingEmail(false)}
        />
      )}

      {confirm === 'suspend' && (
        <ConfirmDialog
          title={`Suspendre ${name} ?`}
          description="Son accès sera coupé immédiatement et il sera prévenu par email. Vous pourrez le réactiver à tout moment."
          confirmLabel="Suspendre"
          loading={busy === 'suspend'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run('suspend')}
        />
      )}
      {confirm === 'archive' && (
        <ConfirmDialog
          title={`Retirer ${name} de votre cabinet ?`}
          description={`Son accès sera coupé immédiatement et il sera prévenu par email. Vous pourrez le restaurer pendant ${GESTIONNAIRE_RESTORE_WINDOW_DAYS} jours ; passé ce délai, son compte est supprimé définitivement après ${ACCOUNT_DELETION_RETENTION_DAYS} jours.`}
          confirmLabel="Retirer"
          loading={busy === 'archive'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run('archive')}
        />
      )}
    </div>
  );
}
