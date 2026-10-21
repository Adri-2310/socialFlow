'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { SalarieFormDialog } from '@/components/gestionnaire/salarie-form-dialog';
import type { CountryOption } from '@/lib/countries';

// Bouton « Nouveau salarié » de la liste d'une entreprise. `readOnly` évite un aller-retour
// inutile : le serveur reste seul juge (423 CABINET_READ_ONLY).
export function SalarieCreate({
  entrepriseId,
  countries,
  readOnly,
}: {
  entrepriseId: string;
  countries: CountryOption[];
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
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        Nouveau salarié
      </button>
      {open && (
        <SalarieFormDialog
          target={{ mode: 'create', entrepriseId }}
          countries={countries}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
