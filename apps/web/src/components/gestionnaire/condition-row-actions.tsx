'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { ConditionFormDialog } from '@/components/gestionnaire/condition-form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { ConditionFormValues } from '@/lib/salarie/condition-form';
import { ERROR_MESSAGES, FALLBACK } from '@/lib/salarie/form-messages';

// Actions d'une ligne de l'historique : corriger une erreur de saisie, ou annuler un
// changement encore à venir (jamais la première ligne ni une ligne déjà en vigueur : le
// serveur le refuse aussi). `readOnly` évite un aller-retour inutile (423 côté serveur).
export function ConditionRowActions({
  salarieId,
  conditionId,
  initial,
  removable,
  readOnly,
}: {
  salarieId: string;
  conditionId: string;
  initial: ConditionFormValues;
  removable: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/salaries/${salarieId}/conditions/${conditionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(ERROR_MESSAGES[body?.error] ?? FALLBACK);
        setConfirming(false);
        return;
      }
      router.refresh();
      setConfirming(false);
    } catch {
      setError(FALLBACK);
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  }

  const bouton =
    'inline-flex items-center gap-1 rounded-lg border border-input px-2.5 py-1 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={readOnly}
        aria-label="Corriger cette condition"
        className={bouton}
      >
        <Pencil className="h-3 w-3" /> Corriger
      </button>
      {removable && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={readOnly}
          aria-label="Annuler ce changement à venir"
          className={bouton}
        >
          <Trash2 className="h-3 w-3" /> Annuler
        </button>
      )}
      {error && (
        <p role="alert" className="basis-full text-right text-xs text-destructive-text">
          {error}
        </p>
      )}
      {editing && (
        <ConditionFormDialog
          target={{ mode: 'edit', salarieId, conditionId }}
          initial={initial}
          onClose={() => setEditing(false)}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title="Annuler ce changement ?"
          description="La ligne sera supprimée de l’historique : le salarié gardera ses conditions actuelles. Cette action est inscrite à l’audit."
          confirmLabel="Annuler le changement"
          loading={loading}
          onCancel={() => setConfirming(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
