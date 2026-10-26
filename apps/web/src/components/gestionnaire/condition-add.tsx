'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ConditionFormDialog } from '@/components/gestionnaire/condition-form-dialog';
import { Button } from '@/components/ui/button';
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={readOnly}
        title={readOnly ? 'Votre cabinet est en lecture seule.' : undefined}
        className="shrink-0 text-xs"
      >
        <Plus />
        Ajouter une condition
      </Button>
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
