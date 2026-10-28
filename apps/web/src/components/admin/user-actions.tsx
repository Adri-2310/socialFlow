'use client';

import { Archive, KeyRound, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/auth/account-retention';
import type { UserRow } from '@/components/admin/users-table';

// Boutons d'une rangée : hauteur tactile de 40 px sur mobile, 32 px au-delà (comme les actions
// de rangée du Cabinet RH et de la liste des cabinets).
const ROW_BUTTON = 'h-10 text-xs sm:h-8';
const ICON_BUTTON = 'size-10 text-muted-foreground sm:size-8';
// « Réactiver » et « Restaurer » : vert lisible sur le fond de la page (D62), pas le teal de la
// marque. Les actions qui coupent un accès rougissent au survol.
const POSITIVE =
  'border-emerald-500/40 text-emerald-800 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-300';
const RESTRICTIVE =
  'text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive-text';

const formatDate = new Intl.DateTimeFormat('fr-BE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// Date de purge définitive d'un compte archivé.
export function purgeDate(deletedAt: string): Date {
  return new Date(
    new Date(deletedAt).getTime() + ACCOUNT_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
}

// Actions possibles sur un compte : aucune pour un SuperAdmin (protégé), restaurer s'il est
// archivé, sinon suspendre ou réactiver, révoquer ses sessions, lui envoyer un lien de
// réinitialisation (D21) et l'archiver.
export function UserRowActions({
  user,
  loading,
  onSuspend,
  onReactivate,
  onRevoke,
  onReset,
  onArchive,
  onRestore,
}: {
  user: UserRow;
  loading: boolean;
  onSuspend: () => void;
  onReactivate: () => void;
  onRevoke: () => void;
  onReset: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  if (user.role === 'SUPER_ADMIN') {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  if (user.deletedAt) {
    return (
      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">
          Purge le {formatDate.format(purgeDate(user.deletedAt))}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRestore}
          disabled={loading}
          className={`${ROW_BUTTON} ${POSITIVE}`}
        >
          {loading && <Spinner />}
          Restaurer
        </Button>
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-2">
      {user.status === 'suspendu' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReactivate}
          disabled={loading}
          className={`${ROW_BUTTON} ${POSITIVE}`}
        >
          {loading && <Spinner />}
          Réactiver
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSuspend}
          disabled={loading}
          className={`${ROW_BUTTON} ${RESTRICTIVE}`}
        >
          Suspendre
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onRevoke}
        disabled={loading}
        title="Révoquer les sessions"
        aria-label={`Révoquer les sessions de ${user.name}`}
        className={ICON_BUTTON}
      >
        <LogOut aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onReset}
        disabled={loading}
        title="Envoyer un lien de réinitialisation"
        aria-label={`Envoyer un lien de réinitialisation à ${user.name}`}
        className={ICON_BUTTON}
      >
        <KeyRound aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onArchive}
        disabled={loading}
        title="Archiver"
        aria-label={`Archiver ${user.name}`}
        className={`size-10 sm:size-8 ${RESTRICTIVE}`}
      >
        <Archive aria-hidden="true" />
      </Button>
    </div>
  );
}

// Les quatre confirmations de la liste : suspendre, révoquer les sessions, envoyer un lien de
// réinitialisation et archiver. Montées seulement quand un compte attend sa confirmation.
export function UserDialogs({
  pendingSuspend,
  pendingRevoke,
  pendingReset,
  pendingArchive,
  loadingId,
  onCancelSuspend,
  onCancelRevoke,
  onCancelReset,
  onCancelArchive,
  onConfirmSuspend,
  onConfirmRevoke,
  onConfirmReset,
  onConfirmArchive,
}: {
  pendingSuspend: UserRow | null;
  pendingRevoke: UserRow | null;
  pendingReset: UserRow | null;
  pendingArchive: UserRow | null;
  loadingId: string | null;
  onCancelSuspend: () => void;
  onCancelRevoke: () => void;
  onCancelReset: () => void;
  onCancelArchive: () => void;
  onConfirmSuspend: (user: UserRow) => void;
  onConfirmRevoke: (user: UserRow) => void;
  onConfirmReset: (user: UserRow) => void;
  onConfirmArchive: (user: UserRow) => void;
}) {
  return (
    <>
      {pendingSuspend && (
        <ConfirmDialog
          title="Suspendre cet utilisateur ?"
          description={`« ${pendingSuspend.name} » perdra l'accès immédiatement. Cette action est réversible.`}
          confirmLabel="Suspendre"
          loading={loadingId === pendingSuspend.id}
          onCancel={onCancelSuspend}
          onConfirm={() => onConfirmSuspend(pendingSuspend)}
        />
      )}

      {pendingRevoke && (
        <ConfirmDialog
          title="Révoquer les sessions ?"
          description={`« ${pendingRevoke.name} » sera déconnecté de tous ses appareils. Il pourra se reconnecter normalement.`}
          confirmLabel="Révoquer"
          loading={loadingId === pendingRevoke.id}
          onCancel={onCancelRevoke}
          onConfirm={() => onConfirmRevoke(pendingRevoke)}
        />
      )}

      {pendingReset && (
        <ConfirmDialog
          title="Envoyer un lien de réinitialisation ?"
          description={`Un email avec un lien valable 1 heure sera envoyé à ${pendingReset.email}. Vous ne voyez et ne définissez jamais son mot de passe.`}
          confirmLabel="Envoyer"
          loading={loadingId === pendingReset.id}
          onCancel={onCancelReset}
          onConfirm={() => onConfirmReset(pendingReset)}
        />
      )}

      {pendingArchive && (
        <ConfirmDialog
          title="Archiver cet utilisateur ?"
          description={`« ${pendingArchive.name} » perdra l'accès immédiatement. Les données seront définitivement supprimées dans ${ACCOUNT_DELETION_RETENTION_DAYS} jours (restauration possible avant cette échéance).`}
          confirmLabel="Archiver"
          loading={loadingId === pendingArchive.id}
          onCancel={onCancelArchive}
          onConfirm={() => onConfirmArchive(pendingArchive)}
        />
      )}
    </>
  );
}
