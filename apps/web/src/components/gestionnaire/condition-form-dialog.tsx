'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { FormDialog } from '@/components/shared/form-dialog';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
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
    <FormDialog
      size="xl"
      icon={<CalendarClock />}
      title={edit ? 'Corriger la condition' : 'Ajouter une condition de travail'}
      description={
        edit
          ? 'Corrige une erreur de saisie sur cette ligne. Pour un vrai changement, ajoutez plutôt une nouvelle condition à sa date.'
          : 'Un changement de statut, de fonction, de régime ou de rémunération s’ajoute à l’historique à partir de sa date d’effet : les anciennes lignes ne sont pas modifiées.'
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <fieldset disabled={loading} className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="cond-date"
            label="Valable à partir du"
            error={err('dateEffet')}
            hint={
              edit
                ? 'La date d’une ligne existante ne se change pas.'
                : 'Peut être passée (rattrapage) ou future, mais pas avant l’entrée du salarié.'
            }
          >
            {(c) => (
              <Input
                {...c}
                type="date"
                value={form.dateEffet}
                onChange={set('dateEffet')}
                readOnly={edit}
              />
            )}
          </FormField>
          <FormField
            id="cond-statut"
            label="Statut"
            error={err('statut')}
            hint={
              form.statut === 'EMPLOYE' ? 'Commission paritaire 200' : 'Commission paritaire 100'
            }
          >
            {(c) => (
              <NativeSelect {...c} value={form.statut} onChange={set('statut')}>
                <NativeSelectOption value="EMPLOYE">Employé</NativeSelectOption>
                <NativeSelectOption value="OUVRIER">Ouvrier</NativeSelectOption>
              </NativeSelect>
            )}
          </FormField>
          <FormField id="cond-fonction" label="Fonction" error={err('fonction')}>
            {(c) => (
              <Input {...c} value={form.fonction} onChange={set('fonction')} autoComplete="off" />
            )}
          </FormField>
          <FormField id="cond-regime" label="Régime" error={err('regime')}>
            {(c) => (
              <NativeSelect {...c} value={form.regime} onChange={set('regime')}>
                <NativeSelectOption value="TEMPS_PLEIN">Temps plein</NativeSelectOption>
                <NativeSelectOption value="TEMPS_PARTIEL">Temps partiel</NativeSelectOption>
              </NativeSelect>
            )}
          </FormField>
          {partiel && (
            <>
              <FormField
                id="cond-heures"
                label="Heures par semaine du salarié"
                error={err('heuresSemaineMinutes')}
                hint="Par exemple 30,4 ou 30:24."
              >
                {(c) => (
                  <Input
                    {...c}
                    value={form.heuresSemaine}
                    onChange={set('heuresSemaine')}
                    inputMode="decimal"
                    autoComplete="off"
                  />
                )}
              </FormField>
              <FormField
                id="cond-heures-ref"
                label="Heures par semaine de la personne de référence"
                error={err('heuresReferenceMinutes')}
                hint="Par exemple 38."
              >
                {(c) => (
                  <Input
                    {...c}
                    value={form.heuresReference}
                    onChange={set('heuresReference')}
                    inputMode="decimal"
                    autoComplete="off"
                  />
                )}
              </FormField>
            </>
          )}
          <FormField
            id="cond-salaire"
            label={
              form.statut === 'EMPLOYE' ? 'Salaire mensuel brut (€)' : 'Salaire horaire brut (€)'
            }
            error={salaireErr}
            hint={form.statut === 'EMPLOYE' ? 'Par exemple 2850,00' : 'Par exemple 17,25'}
          >
            {(c) => (
              <Input
                {...c}
                value={form.salaire}
                onChange={set('salaire')}
                inputMode="decimal"
                autoComplete="off"
              />
            )}
          </FormField>
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive-text">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Spinner />}
            {edit ? 'Enregistrer' : 'Ajouter la condition'}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
