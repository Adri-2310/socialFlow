'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { Field, inputClass } from '@/components/gestionnaire/form-field';
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={readOnly || mois.length === 0}
        title={readOnly ? 'Votre cabinet est en lecture seule.' : undefined}
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <CalendarPlus className="h-4 w-4" />
        Ouvrir une période
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleSubmit}
            noValidate
            role="dialog"
            aria-modal="true"
            aria-labelledby="periode-ouvrir-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
          >
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <CalendarPlus className="h-5 w-5" />
              </span>
              <div>
                <h3 id="periode-ouvrir-title" className="text-lg font-semibold text-foreground">
                  Ouvrir une période
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  L’entreprise donne ses prestations du mois avant le {jourLimite} de ce mois ; vous
                  pourrez décaler cette date pour la période.
                </p>
              </div>
            </div>

            <fieldset disabled={loading} className="mt-5">
              <Field
                id="periode-mois"
                label="Mois"
                error={
                  fieldError ? (PERIODE_FIELD_ERRORS[fieldError] ?? 'Valeur invalide.') : undefined
                }
                hint="Un mois passé (rattrapage), le mois courant ou le mois suivant."
              >
                <select
                  id="periode-mois"
                  value={choix}
                  onChange={(e) => setChoix(e.target.value)}
                  className={inputClass}
                >
                  {mois.map((m) => (
                    <option key={`${m.annee}-${m.mois}`} value={`${m.annee}-${m.mois}`}>
                      {libelleMois(m.annee, m.mois)}
                    </option>
                  ))}
                </select>
              </Field>
            </fieldset>

            {error && (
              <p role="alert" className="mt-4 text-sm text-destructive-text">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={fermer}
                disabled={loading}
                className="rounded-lg border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Ouvrir
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
