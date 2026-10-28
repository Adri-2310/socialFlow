'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus } from 'lucide-react';
import { FormDialog } from '@/components/shared/form-dialog';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { libelleMois } from '@/lib/periode/periode-format';
import {
  FALLBACK,
  PERIODE_ERROR_MESSAGES,
  PERIODE_FIELD_ERRORS,
} from '@/lib/periode/periode-messages';

// Ouvre la période de paie d'un mois (D90, roles/03 § 5). Les mois proposés (passés, courant ou
// suivant, sans ceux déjà ouverts) sont calculés par le serveur ; celui-ci revalide tout.
// `readOnly` évite un aller-retour inutile : le serveur reste seul juge (423).
export function PeriodeOuvrir({
  entrepriseId,
  mois,
  moisCourant,
  jourLimite,
  readOnly,
}: {
  entrepriseId: string;
  mois: { annee: number; mois: number }[];
  // Proposé d'abord si sa période n'est pas encore ouverte, sinon le plus récent des mois restants.
  moisCourant: { annee: number; mois: number };
  jourLimite: number;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const parDefaut =
    mois.find((m) => m.annee === moisCourant.annee && m.mois === moisCourant.mois) ?? mois[0];
  const [choix, setChoix] = useState(parDefaut ? `${parDefaut.annee}-${parDefaut.mois}` : '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function fermer() {
    setOpen(false);
    setFieldError(null);
    setError(null);
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    const [annee, moisChoisi] = choix.split('-').map(Number);
    if (!annee || !moisChoisi) {
      setFieldError('INVALID_MOIS');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/entreprises/${entrepriseId}/periodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ annee, mois: moisChoisi }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (body?.fields?.mois) setFieldError(body.fields.mois);
        else setError(PERIODE_ERROR_MESSAGES[body?.error] ?? FALLBACK);
        return;
      }
      router.refresh();
      fermer();
    } catch {
      setError(FALLBACK);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        disabled={readOnly || mois.length === 0}
        title={readOnly ? 'Votre cabinet est en lecture seule.' : undefined}
        className="shrink-0"
      >
        <CalendarPlus />
        Ouvrir une période
      </Button>

      {open && (
        <FormDialog
          icon={<CalendarPlus />}
          title="Ouvrir une période"
          description={`L’entreprise donne ses prestations du mois avant le ${jourLimite} de ce mois ; vous pourrez décaler cette date pour la période.`}
        >
          <form onSubmit={handleSubmit} noValidate>
            <fieldset disabled={loading}>
              <FormField
                id="periode-mois"
                label="Mois"
                error={
                  fieldError ? (PERIODE_FIELD_ERRORS[fieldError] ?? 'Valeur invalide.') : undefined
                }
                hint="Un mois passé (rattrapage), le mois courant ou le mois suivant."
              >
                {(c) => (
                  <NativeSelect {...c} value={choix} onChange={(e) => setChoix(e.target.value)}>
                    {mois.map((m) => (
                      <NativeSelectOption
                        key={`${m.annee}-${m.mois}`}
                        value={`${m.annee}-${m.mois}`}
                      >
                        {libelleMois(m.annee, m.mois)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            </fieldset>

            {error && (
              <p role="alert" className="mt-4 text-sm text-destructive-text">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <Button type="button" variant="outline" onClick={fermer} disabled={loading}>
                Annuler
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Spinner />}
                Ouvrir
              </Button>
            </div>
          </form>
        </FormDialog>
      )}
    </>
  );
}
