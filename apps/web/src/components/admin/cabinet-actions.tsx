'use client';

import { Archive } from 'lucide-react';
import { SuspendCabinetDialog } from '@/components/admin/suspend-cabinet-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { SuspensionType } from '@/lib/cabinet/cabinet-suspension';
import { CABINET_DELETION_RETENTION_DAYS } from '@/lib/cabinet/cabinet-retention';
import type { CabinetRow } from '@/components/admin/cabinets-table';

// Boutons d'une rangée : hauteur tactile de 40 px sur mobile, 32 px au-delà (comme les actions
// de rangée du Cabinet RH).
const ROW_BUTTON = 'h-10 text-xs sm:h-8';
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

// Date de purge définitive d'un cabinet archivé.
export function purgeDate(deletedAt: string): Date {
  return new Date(
    new Date(deletedAt).getTime() + CABINET_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
}

// Actions possibles sur un cabinet selon son état : archivé (restaurer), suspendu en lecture
// seule (bloquer, réactiver, archiver), suspendu avec blocage (réactiver, archiver) ou actif
// (suspendre, archiver).
export function CabinetRowActions({
  cabinet,
  loading,
  onSuspend,
  onBlock,
  onReactivate,
  onArchive,
  onRestore,
}: {
  cabinet: CabinetRow;
  loading: boolean;
  onSuspend: () => void;
  onBlock: () => void;
  onReactivate: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  if (cabinet.deletedAt) {
    return (
      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">
          Purge le {formatDate.format(purgeDate(cabinet.deletedAt))}
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
      {cabinet.status === 'suspendu' && cabinet.suspensionType === 'READ_ONLY' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBlock}
          disabled={loading}
          className={`${ROW_BUTTON} ${RESTRICTIVE}`}
        >
          Bloquer
        </Button>
      )}
      {cabinet.status === 'suspendu' ? (
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
        onClick={onArchive}
        disabled={loading}
        title="Archiver"
        aria-label={`Archiver ${cabinet.name}`}
        className={`size-10 sm:size-8 ${RESTRICTIVE}`}
      >
        <Archive aria-hidden="true" />
      </Button>
    </div>
  );
}

// Les trois confirmations de la liste : suspendre (lecture seule), bloquer les connexions et
// archiver. Montées seulement quand un cabinet est en attente de confirmation.
export function CabinetDialogs({
  pendingSuspend,
  pendingBlock,
  pendingArchive,
  loadingId,
  suspendError,
  onCancelSuspend,
  onCancelBlock,
  onCancelArchive,
  onConfirmSuspension,
  onConfirmArchive,
}: {
  pendingSuspend: CabinetRow | null;
  pendingBlock: CabinetRow | null;
  pendingArchive: CabinetRow | null;
  loadingId: string | null;
  suspendError: string | null;
  onCancelSuspend: () => void;
  onCancelBlock: () => void;
  onCancelArchive: () => void;
  onConfirmSuspension: (id: string, input: { mode: SuspensionType; reason: string }) => void;
  onConfirmArchive: (id: string) => void;
}) {
  return (
    <>
      {pendingSuspend && (
        <SuspendCabinetDialog
          cabinetName={pendingSuspend.name}
          loading={loadingId === pendingSuspend.id}
          error={suspendError}
          onCancel={onCancelSuspend}
          onConfirm={(input) => onConfirmSuspension(pendingSuspend.id, input)}
        />
      )}

      {pendingBlock && (
        <SuspendCabinetDialog
          cabinetName={pendingBlock.name}
          initialMode="BLOCKED"
          loading={loadingId === pendingBlock.id}
          error={suspendError}
          onCancel={onCancelBlock}
          onConfirm={(input) => onConfirmSuspension(pendingBlock.id, input)}
        />
      )}

      {pendingArchive && (
        <ConfirmDialog
          title="Archiver ce cabinet ?"
          description={`Le cabinet « ${pendingArchive.name} » et ses utilisateurs perdront l'accès immédiatement. Les données seront définitivement supprimées dans ${CABINET_DELETION_RETENTION_DAYS} jours (restauration possible avant cette échéance).`}
          confirmLabel="Archiver"
          loading={loadingId === pendingArchive.id}
          onCancel={onCancelArchive}
          onConfirm={() => onConfirmArchive(pendingArchive.id)}
        />
      )}
    </>
  );
}
