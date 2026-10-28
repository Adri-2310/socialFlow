'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={readOnly}
        title={readOnly ? 'Votre cabinet est en lecture seule.' : undefined}
        className="shrink-0"
      >
        <Pencil />
        Modifier
      </Button>
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
