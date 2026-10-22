'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil } from 'lucide-react';
import { Field, inputClass } from '@/components/gestionnaire/form-field';
import {
  FALLBACK,
  PERIODE_ERROR_MESSAGES,
  PERIODE_FIELD_ERRORS,
} from '@/lib/periode/periode-messages';
import {
  toPrestationFormValues,
  toPrestationPayload,
  type PrestationFormValues,
} from '@/lib/periode/prestation-form';
import { invalidFields } from '@/lib/schemas/salarie';
import { prestationSchema, type PrestationInput } from '@/lib/schemas/prestation';

// Encodage des écarts d'un salarié pour une période (D92) : « un salarié sans écart vaut mois
// complet selon son régime ». Le serveur revalide tout ; les erreurs reviennent champ par champ.
// `bloque` : période verrouillée ou cabinet en lecture seule, le bouton est désactivé avec la
// raison en infobulle (le serveur reste seul juge).
export function PrestationEncoder({
  periodeId,
  annee,
  mois,
  salarieId,
  salarieNom,
  initial,
  bloque,
}: {
  periodeId: string;
  annee: number;
  mois: number;
  salarieId: string;
  salarieNom: string;
  initial: PrestationInput | null;
  bloque: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PrestationFormValues>(toPrestationFormValues(initial));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (field: keyof PrestationFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: e.target.value }));

  const err = (field: string) =>
    fieldErrors[field]
      ? (PERIODE_FIELD_ERRORS[fieldErrors[field]] ?? 'Valeur invalide.')
      : undefined;

  function ouvrir() {
    setForm(toPrestationFormValues(initial));
    setFieldErrors({});
    setError(null);
    setOpen(true);
  }

  async function envoyer(methode: 'PUT' | 'DELETE', body?: unknown) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/periodes/${periodeId}/prestations/${salarieId}`, {
        method: methode,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const reponse = await res.json().catch(() => null);
      if (!res.ok) {
        if (reponse?.fields) setFieldErrors(reponse.fields);
        else setError(PERIODE_ERROR_MESSAGES[reponse?.error] ?? FALLBACK);
        return;
      }
      router.refresh();
      setOpen(false);
    } catch {
      setError(FALLBACK);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const payload = toPrestationPayload(form);
    const check = prestationSchema(annee, mois).safeParse(payload);
    if (!check.success) {
      setFieldErrors(invalidFields(check.error));
      return;
    }
    void envoyer('PUT', payload);
  }

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        disabled={bloque !== null}
        title={bloque ?? undefined}
        aria-label={`Encoder les prestations de ${salarieNom}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Pencil className="h-3.5 w-3.5" /> Encoder
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleSubmit}
            noValidate
            role="dialog"
            aria-modal="true"
            aria-labelledby="prestation-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
          >
            <h3 id="prestation-title" className="text-lg font-semibold text-foreground">
              Prestations de {salarieNom}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Saisissez seulement les écarts. Sans rien saisir, le salarié est payé pour un mois
              complet selon son régime.
            </p>

            <fieldset disabled={loading} className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                id="pre-conge"
                label="Congé (jours)"
                error={err('congeDemiJours')}
                hint="Par pas de 0,5 (une demi-journée)."
              >
                <input
                  id="pre-conge"
                  inputMode="decimal"
                  value={form.conge}
                  onChange={set('conge')}
                  className={inputClass}
                />
              </Field>
              <Field id="pre-maladie" label="Maladie (jours)" error={err('maladieDemiJours')}>
                <input
                  id="pre-maladie"
                  inputMode="decimal"
                  value={form.maladie}
                  onChange={set('maladie')}
                  className={inputClass}
                />
              </Field>
              <Field id="pre-ferie" label="Jours fériés (jours)" error={err('ferieDemiJours')}>
                <input
                  id="pre-ferie"
                  inputMode="decimal"
                  value={form.ferie}
                  onChange={set('ferie')}
                  className={inputClass}
                />
              </Field>
              <Field
                id="pre-absence"
                label="Absence non rémunérée (jours)"
                error={err('absenceNonRemDemiJours')}
              >
                <input
                  id="pre-absence"
                  inputMode="decimal"
                  value={form.absenceNonRem}
                  onChange={set('absenceNonRem')}
                  className={inputClass}
                />
              </Field>
              <Field
                id="pre-heures"
                label="Heures prestées"
                error={err('heuresPresteesMinutes')}
                hint="Facultatif, surtout pour les ouvriers. Ex. 152:30 ou 152,5."
              >
                <input
                  id="pre-heures"
                  inputMode="decimal"
                  value={form.heuresPrestees}
                  onChange={set('heuresPrestees')}
                  className={inputClass}
                />
              </Field>
              <Field
                id="pre-sup"
                label="Heures supplémentaires"
                error={err('heuresSupMinutes')}
                hint="Ex. 1:30 ou 1,5."
              >
                <input
                  id="pre-sup"
                  inputMode="decimal"
                  value={form.heuresSup}
                  onChange={set('heuresSup')}
                  className={inputClass}
                />
              </Field>
              <Field id="pre-prime" label="Prime (€)" error={err('primeCents')} hint="Ex. 150,00.">
                <input
                  id="pre-prime"
                  inputMode="decimal"
                  value={form.primeMontant}
                  onChange={set('primeMontant')}
                  className={inputClass}
                />
              </Field>
              <Field id="pre-prime-libelle" label="Libellé de la prime" error={err('primeLibelle')}>
                <input
                  id="pre-prime-libelle"
                  maxLength={60}
                  value={form.primeLibelle}
                  onChange={set('primeLibelle')}
                  className={inputClass}
                />
              </Field>
            </fieldset>

            {error && (
              <p role="alert" className="mt-4 text-sm text-destructive-text">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              {initial && (
                <button
                  type="button"
                  onClick={() => void envoyer('DELETE')}
                  disabled={loading}
                  className="rounded-lg border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:mr-auto"
                >
                  Effacer les écarts
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
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
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
