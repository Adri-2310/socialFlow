'use client';

import { useState } from 'react';
import { Loader2, PauseCircle } from 'lucide-react';
import { SUSPENSION_REASON_MAX, type SuspensionType } from '@/lib/cabinet/cabinet-suspension';

// Suspension manuelle d'un cabinet par le SuperAdmin (D71). Par defaut : lecture
// seule, les connexions restent possibles. Le blocage total est un choix explicite
// pour les cas graves, et exige un motif.
export function SuspendCabinetDialog({
  cabinetName,
  initialMode = 'READ_ONLY',
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  cabinetName: string;
  // 'BLOCKED' : escalade d'une lecture seule deja posee.
  initialMode?: SuspensionType;
  loading?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (input: { mode: SuspensionType; reason: string }) => void;
}) {
  const [blocked, setBlocked] = useState(initialMode === 'BLOCKED');
  const [reason, setReason] = useState('');

  const reasonMissing = blocked && reason.trim().length === 0;
  const mode: SuspensionType = blocked ? 'BLOCKED' : 'READ_ONLY';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="suspend-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
            <PauseCircle className="h-5 w-5" />
          </span>
          <div>
            <h3 id="suspend-title" className="text-lg font-semibold text-foreground">
              {initialMode === 'BLOCKED' ? 'Bloquer les connexions ?' : 'Suspendre ce cabinet ?'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {blocked
                ? `Plus aucun utilisateur de « ${cabinetName} » ne pourra se connecter, et ses sessions en cours sont coupées immédiatement.`
                : `Le cabinet « ${cabinetName} » passe en lecture seule : ses utilisateurs peuvent se connecter et consulter leurs données, mais plus rien ne peut être modifié. Cette action est réversible.`}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm">
            <input
              type="checkbox"
              checked={blocked}
              onChange={(e) => setBlocked(e.target.checked)}
              disabled={initialMode === 'BLOCKED' || loading}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-semibold text-foreground">Bloquer aussi toutes les connexions</span>
              <span className="block text-xs text-muted-foreground">
                Cas graves seulement : compte compromis, fraude, abus. Un motif est alors obligatoire.
              </span>
            </span>
          </label>

          <div>
            <label htmlFor="suspend-reason" className="text-sm font-medium text-foreground">
              Motif {blocked ? '' : '(facultatif)'}
            </label>
            <textarea
              id="suspend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={SUSPENSION_REASON_MAX}
              rows={3}
              disabled={loading}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 sm:text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Inscrit dans le journal d’audit, jamais montré aux clients du cabinet.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ mode, reason: reason.trim() })}
            disabled={loading || reasonMissing}
            className="flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {blocked ? 'Bloquer les connexions' : 'Suspendre'}
          </button>
        </div>
      </div>
    </div>
  );
}
