'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Loader2 } from 'lucide-react';
import { Field, inputClass } from '@/components/gestionnaire/form-field';
import { toConditionPayload, type ConditionFormValues } from '@/lib/salarie/condition-form';
import { ERROR_MESSAGES, FALLBACK, FIELD_ERRORS } from '@/lib/salarie/form-messages';
import { conditionTravailSchema, invalidFields } from '@/lib/schemas/salarie';

export type ConditionFormTarget =
  | { mode: 'add'; salarieId: string }
  // Correction d'une ligne existante : sa date ne change jamais.
  | { mode: 'edit'; salarieId: string; conditionId: string };

// Ajout d'une ligne à l'historique daté des conditions de travail, ou correction d'une
// ligne existante (roles/03 § 4.2). Le serveur revalide tout ; les erreurs reviennent champ
// par champ.
export function ConditionFormDialog({
  target,
  initial,
  onClose,
}: {
  target: ConditionFormTarget;
  initial: ConditionFormValues;
  onClose: () => void;
}) {
  const edit = target.mode === 'edit';
  const router = useRouter();
  const [form, setForm] = useState<ConditionFormValues>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set =
    <K extends keyof ConditionFormValues>(field: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [field]: e.target.value as ConditionFormValues[K] }));

  const err = (field: string) =>
    fieldErrors[field] ? (FIELD_ERRORS[fieldErrors[field]] ?? 'Valeur invalide.') : undefined;
  // Le montant est un seul champ à l'écran mais deux à l'API selon le statut.
  const salaireErr =
    form.statut === 'EMPLOYE' ? err('salaireMensuelBrutCents') : err('salaireHoraireBrutCents');

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const payload = toConditionPayload(form);
    const check = conditionTravailSchema.safeParse(payload);
    if (!check.success) {
      setFieldErrors(invalidFields(check.error));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        target.mode === 'edit'
          ? `/api/salaries/${target.salarieId}/conditions/${target.conditionId}`
          : `/api/salaries/${target.salarieId}/conditions`,
        {
          method: target.mode === 'edit' ? 'PUT' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        if (body?.fields) setFieldErrors(body.fields);
        else setError(ERROR_MESSAGES[body?.error] ?? FALLBACK);
        return;
      }

      router.refresh();
      onClose();
    } catch {
      setError(FALLBACK);
    } finally {
      setLoading(false);
    }
  }

  const partiel = form.regime === 'TEMPS_PARTIEL';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="condition-form-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h3 id="condition-form-title" className="text-lg font-semibold text-foreground">
              {edit ? 'Corriger la condition' : 'Ajouter une condition de travail'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {edit
                ? 'Corrige une erreur de saisie sur cette ligne. Pour un vrai changement, ajoutez plutôt une nouvelle condition à sa date.'
                : 'Un changement de statut, de fonction, de régime ou de rémunération s’ajoute à l’historique à partir de sa date d’effet : les anciennes lignes ne sont pas modifiées.'}
            </p>
          </div>
        </div>

        <fieldset disabled={loading} className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            id="cond-date"
            label="Valable à partir du"
            error={err('dateEffet')}
            hint={
              edit
                ? 'La date d’une ligne existante ne se change pas.'
                : 'Peut être passée (rattrapage) ou future, mais pas avant l’entrée du salarié.'
            }
          >
            <input
              id="cond-date"
              type="date"
              value={form.dateEffet}
              onChange={set('dateEffet')}
              readOnly={edit}
              className={inputClass}
            />
          </Field>
          <Field
            id="cond-statut"
            label="Statut"
            error={err('statut')}
            hint={
              form.statut === 'EMPLOYE' ? 'Commission paritaire 200' : 'Commission paritaire 100'
            }
          >
            <select
              id="cond-statut"
              value={form.statut}
              onChange={set('statut')}
              className={inputClass}
            >
              <option value="EMPLOYE">Employé</option>
              <option value="OUVRIER">Ouvrier</option>
            </select>
          </Field>
          <Field id="cond-fonction" label="Fonction" error={err('fonction')}>
            <input
              id="cond-fonction"
              value={form.fonction}
              onChange={set('fonction')}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <Field id="cond-regime" label="Régime" error={err('regime')}>
            <select
              id="cond-regime"
              value={form.regime}
              onChange={set('regime')}
              className={inputClass}
            >
              <option value="TEMPS_PLEIN">Temps plein</option>
              <option value="TEMPS_PARTIEL">Temps partiel</option>
            </select>
          </Field>
          {partiel && (
            <>
              <Field
                id="cond-heures"
                label="Heures par semaine du salarié"
                error={err('heuresSemaine')}
              >
                <input
                  id="cond-heures"
                  value={form.heuresSemaine}
                  onChange={set('heuresSemaine')}
                  inputMode="decimal"
                  autoComplete="off"
                  className={inputClass}
                />
              </Field>
              <Field
                id="cond-heures-ref"
                label="Heures par semaine de la personne de référence"
                error={err('heuresReference')}
              >
                <input
                  id="cond-heures-ref"
                  value={form.heuresReference}
                  onChange={set('heuresReference')}
                  inputMode="decimal"
                  autoComplete="off"
                  className={inputClass}
                />
              </Field>
            </>
          )}
          <Field
            id="cond-salaire"
            label={
              form.statut === 'EMPLOYE' ? 'Salaire mensuel brut (€)' : 'Salaire horaire brut (€)'
            }
            error={salaireErr}
            hint={form.statut === 'EMPLOYE' ? 'Par exemple 2850,00' : 'Par exemple 17,25'}
          >
            <input
              id="cond-salaire"
              value={form.salaire}
              onChange={set('salaire')}
              inputMode="decimal"
              autoComplete="off"
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
          <button
            type="button"
            onClick={onClose}
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
            {edit ? 'Enregistrer' : 'Ajouter la condition'}
          </button>
        </div>
      </form>
    </div>
  );
}
