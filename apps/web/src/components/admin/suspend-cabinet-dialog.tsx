'use client';

import { useState } from 'react';
import { PauseCircle } from 'lucide-react';
import { SUSPENSION_REASON_MAX, type SuspensionType } from '@/lib/cabinet/cabinet-suspension';
import { FormDialog } from '@/components/shared/form-dialog';
import { CheckField, FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

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
    <FormDialog
      title={initialMode === 'BLOCKED' ? 'Bloquer les connexions ?' : 'Suspendre ce cabinet ?'}
      description={
        blocked
          ? `Plus aucun utilisateur de « ${cabinetName} » ne pourra se connecter, et ses sessions en cours sont coupées immédiatement.`
          : `Le cabinet « ${cabinetName} » passe en lecture seule : ses utilisateurs peuvent se connecter et consulter leurs données, mais plus rien ne peut être modifié. Cette action est réversible.`
      }
      icon={<PauseCircle />}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-3">
          <CheckField
            label="Bloquer aussi toutes les connexions"
            hint="Cas graves seulement : compte compromis, fraude, abus. Un motif est alors obligatoire."
            checked={blocked}
            onCheckedChange={setBlocked}
            disabled={initialMode === 'BLOCKED' || loading}
          />
        </div>

        <FormField
          id="suspend-reason"
          label={blocked ? 'Motif' : 'Motif (facultatif)'}
          required={blocked}
          hint="Inscrit dans le journal d’audit, jamais montré aux clients du cabinet."
        >
          {(control) => (
            <Textarea
              {...control}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={SUSPENSION_REASON_MAX}
              rows={3}
              disabled={loading}
            />
          )}
        </FormField>

        {error && (
          <p role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Annuler
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => onConfirm({ mode, reason: reason.trim() })}
          disabled={loading || reasonMissing}
        >
          {loading && <Spinner />}
          {blocked ? 'Bloquer les connexions' : 'Suspendre'}
        </Button>
      </div>
    </FormDialog>
  );
}
