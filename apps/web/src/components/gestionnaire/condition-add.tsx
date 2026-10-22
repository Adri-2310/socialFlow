'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ConditionFormDialog } from '@/components/gestionnaire/condition-form-dialog';
import type { ConditionFormValues } from '@/lib/salarie/condition-form';

// Bouton « Ajouter une condition » de la fiche, préremplie avec la condition en vigueur.
// `readOnly` évite un aller-retour inutile : le serveur reste seul juge (423).
export function ConditionAdd({
  salarieId,
  initial,
  readOnly,
}: {
  salarieId: string;
  initial: ConditionFormValues;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={readOnly}
        title={readOnly ? 'Votre cabinet est en lecture seule.' : undefined}
        className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-input px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="h-3.5 w-3.5" />
        Ajouter une condition
      </button>
      {open && (
        <ConditionFormDialog
          target={{ mode: 'add', salarieId }}
          initial={initial}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
