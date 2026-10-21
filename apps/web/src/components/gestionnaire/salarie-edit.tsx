'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { SalarieFormDialog } from '@/components/gestionnaire/salarie-form-dialog';
import type { CountryOption } from '@/lib/countries';
import type { FormValues } from '@/lib/salarie/salarie-form';

// Bouton « Modifier » de la fiche d'un salarié. `readOnly` évite un aller-retour inutile :
// le serveur reste seul juge (423 CABINET_READ_ONLY).
export function SalarieEdit({
  salarieId,
  initial,
  nissMasque,
  ibanMasque,
  countries,
  readOnly,
}: {
  salarieId: string;
  initial: FormValues;
  nissMasque: string;
  ibanMasque: string;
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
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Pencil className="h-4 w-4" />
        Modifier
      </button>
      {open && (
        <SalarieFormDialog
          target={{ mode: 'edit', salarieId, initial, nissMasque, ibanMasque }}
          countries={countries}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
