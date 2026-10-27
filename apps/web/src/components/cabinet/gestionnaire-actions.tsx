'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, PauseCircle, PlayCircle, UserMinus } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EditEmailDialog } from '@/components/cabinet/edit-email-dialog';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/auth/account-retention';
import { GESTIONNAIRE_RESTORE_WINDOW_DAYS } from '@/lib/cabinet/gestionnaire-retention';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Vous n'êtes pas autorisé à effectuer cette action.",
  GESTIONNAIRE_NOT_FOUND: 'Ce gestionnaire est introuvable.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
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
      // D27 : on nomme les entreprises a reassigner avant de pouvoir continuer.
      if (
        body?.error === 'GESTIONNAIRE_HAS_UNCOVERED_ENTREPRISES' &&
        Array.isArray(body.entreprises)
      ) {
        const names = body.entreprises.map((e: { name: string }) => e.name).join(', ');
        setError(`Réassignez d’abord ces entreprises à un autre gestionnaire actif : ${names}.`);
        return;
      }
      setError(ERROR_MESSAGES[body?.error] ?? 'Une erreur est survenue. Veuillez réessayer.');
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:shrink-0 sm:items-end">
      <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditingEmail(true)}
          disabled={busy !== null}
          aria-label={`Modifier l'email de ${name}`}
          className="h-10 text-xs sm:h-8"
        >
          <Pencil aria-hidden="true" />
          Email
        </Button>
        {status === 'actif' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirm('suspend')}
            disabled={busy !== null}
            aria-label={`Suspendre ${name}`}
            className="h-10 text-xs sm:h-8"
          >
            <PauseCircle aria-hidden="true" />
            Suspendre
          </Button>
        ) : reactivatableByCabinet ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => run('reactivate')}
            disabled={busy !== null}
            aria-label={`Réactiver ${name}`}
            className="h-10 text-xs sm:h-8"
          >
            {busy === 'reactivate' ? <Spinner /> : <PlayCircle aria-hidden="true" />}
            Réactiver
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirm('archive')}
          disabled={busy !== null}
          aria-label={`Retirer ${name}`}
          className="h-10 text-xs sm:h-8 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
        >
          <UserMinus aria-hidden="true" />
          Retirer
        </Button>
      </div>
      {status === 'suspendu' && !reactivatableByCabinet && (
        <p className="max-w-xs text-left sm:text-right text-xs text-muted-foreground">
          Suspendu par l&apos;administration SocialFlow.
        </p>
      )}
      {error && (
        <p className="max-w-xs text-left sm:text-right text-xs text-destructive-text">{error}</p>
      )}

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
