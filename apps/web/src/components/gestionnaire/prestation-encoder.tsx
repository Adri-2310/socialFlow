'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { FormDialog } from '@/components/shared/form-dialog';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={ouvrir}
        disabled={bloque !== null}
        title={bloque ?? undefined}
        aria-label={`Encoder les prestations de ${salarieNom}`}
        className="text-xs"
      >
        <Pencil /> Encoder
      </Button>

      {open && (
        <FormDialog
          size="lg"
          title={`Prestations de ${salarieNom}`}
          description="Saisissez seulement les écarts. Sans rien saisir, le salarié est payé pour un mois complet selon son régime."
        >
          <form onSubmit={handleSubmit} noValidate>
            <fieldset disabled={loading} className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="pre-conge"
                label="Congé (jours)"
                error={err('congeDemiJours')}
                hint="Par pas de 0,5 (une demi-journée)."
              >
                {(c) => (
                  <Input {...c} inputMode="decimal" value={form.conge} onChange={set('conge')} />
                )}
              </FormField>
              <FormField id="pre-maladie" label="Maladie (jours)" error={err('maladieDemiJours')}>
                {(c) => (
                  <Input
                    {...c}
                    inputMode="decimal"
                    value={form.maladie}
                    onChange={set('maladie')}
                  />
                )}
              </FormField>
              <FormField id="pre-ferie" label="Jours fériés (jours)" error={err('ferieDemiJours')}>
                {(c) => (
                  <Input {...c} inputMode="decimal" value={form.ferie} onChange={set('ferie')} />
                )}
              </FormField>
              <FormField
                id="pre-absence"
                label="Absence non rémunérée (jours)"
                error={err('absenceNonRemDemiJours')}
              >
                {(c) => (
                  <Input
                    {...c}
                    inputMode="decimal"
                    value={form.absenceNonRem}
                    onChange={set('absenceNonRem')}
                  />
                )}
              </FormField>
              <FormField
                id="pre-heures"
                label="Heures prestées"
                error={err('heuresPresteesMinutes')}
                hint="Facultatif, surtout pour les ouvriers. Ex. 152:30 ou 152,5."
              >
                {(c) => (
                  <Input
                    {...c}
                    inputMode="decimal"
                    value={form.heuresPrestees}
                    onChange={set('heuresPrestees')}
                  />
                )}
              </FormField>
              <FormField
                id="pre-sup"
                label="Heures supplémentaires"
                error={err('heuresSupMinutes')}
                hint="Ex. 1:30 ou 1,5."
              >
                {(c) => (
                  <Input
                    {...c}
                    inputMode="decimal"
                    value={form.heuresSup}
                    onChange={set('heuresSup')}
                  />
                )}
              </FormField>
              <FormField
                id="pre-prime"
                label="Prime (€)"
                error={err('primeCents')}
                hint="Ex. 150,00."
              >
                {(c) => (
                  <Input
                    {...c}
                    inputMode="decimal"
                    value={form.primeMontant}
                    onChange={set('primeMontant')}
                  />
                )}
              </FormField>
              <FormField
                id="pre-prime-libelle"
                label="Libellé de la prime"
                error={err('primeLibelle')}
              >
                {(c) => (
                  <Input
                    {...c}
                    maxLength={60}
                    value={form.primeLibelle}
                    onChange={set('primeLibelle')}
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
              {initial && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void envoyer('DELETE')}
                  disabled={loading}
                  className="sm:mr-auto"
                >
                  Effacer les écarts
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Spinner />}
                Enregistrer
              </Button>
            </div>
          </form>
        </FormDialog>
      )}
    </>
  );
}
