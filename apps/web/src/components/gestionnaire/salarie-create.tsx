'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <Button
        type="button"
        onClick={() => setOpen(true)}
        disabled={readOnly}
        title={readOnly ? 'Votre cabinet est en lecture seule.' : undefined}
        className="shrink-0"
      >
        <Plus />
        Nouveau salarié
      </Button>
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
