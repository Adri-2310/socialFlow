'use client';

import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pendingPlanQuotaMessage } from '@/lib/billing/quota-messages';
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
  quota?: { used: number; limit: number | null; pendingPlan?: string | null };
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
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={reached || readOnly}
          className="shrink-0"
        >
          <Plus />
          Nouvelle entreprise
        </Button>
      </div>

      {reached && (
        <p className="mt-3 text-sm text-destructive-text">
          {quota?.pendingPlan ? (
            pendingPlanQuotaMessage(quota.pendingPlan, 'entreprises')
          ) : (
            <>
              Le quota d&apos;entreprises de votre plan est atteint : archivez-en une ou passez à un
              plan supérieur.
            </>
          )}
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
