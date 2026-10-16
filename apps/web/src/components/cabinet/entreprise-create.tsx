'use client';

import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import {
  EMPTY_ENTREPRISE,
  EntrepriseFormDialog,
  type GestionnaireOption,
} from '@/components/cabinet/entreprise-form-dialog';
import type { CountryOption } from '@/lib/countries';

// Bandeau de creation d'une entreprise cliente (D4). `quota` sert uniquement
// a informer et a eviter un aller-retour inutile : le serveur reste seul juge
// (403 QUOTA_EXCEEDED).
export function EntrepriseCreate({
  countries,
  gestionnaires,
  quota,
  readOnly,
}: {
  countries: CountryOption[];
  gestionnaires: GestionnaireOption[];
  quota?: { used: number; limit: number | null };
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const reached = !!quota && quota.limit !== null && quota.used >= quota.limit;

  return (
    <div className="rounded-xl border border-border/60 bg-background p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Entreprises clientes</p>
            <p className="text-xs text-muted-foreground">
              Chaque entreprise est confiée à un ou plusieurs gestionnaires.
              {quota && quota.limit !== null && (
                <>
                  {' '}
                  <span className="whitespace-nowrap font-medium">
                    {quota.used} / {quota.limit} entreprises
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={reached || readOnly}
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          Nouvelle entreprise
        </button>
      </div>

      {reached && (
        <p className="mt-3 text-sm text-destructive-text">
          Le quota d&apos;entreprises de votre plan est atteint : archivez-en une ou passez à un plan
          supérieur.
        </p>
      )}
      {readOnly && (
        <p className="mt-3 text-sm text-muted-foreground">
          Votre cabinet est en lecture seule : régularisez votre abonnement pour modifier votre
          portefeuille.
        </p>
      )}

      {open && (
        <EntrepriseFormDialog
          initial={EMPTY_ENTREPRISE}
          countries={countries}
          gestionnaires={gestionnaires}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
