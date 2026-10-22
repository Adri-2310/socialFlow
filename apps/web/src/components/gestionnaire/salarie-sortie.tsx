'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { DoorOpen, Loader2 } from 'lucide-react';
import { Field, inputClass } from '@/components/gestionnaire/form-field';
import { ERROR_MESSAGES, FALLBACK, FIELD_ERRORS } from '@/lib/salarie/form-messages';

// Messages propres à cette boîte : la date de sortie s'y saisit, contrairement au formulaire
// de création où elle est refusée.
const DATE_ERRORS: Record<string, string> = {
  ...FIELD_ERRORS,
  INVALID_DATE_SORTIE: 'Date de sortie invalide.',
};

// Enregistre, corrige ou efface la date de sortie d'un salarié (roles/03 § 4.2). Le serveur
// revalide tout. `readOnly` évite un aller-retour inutile : le serveur reste seul juge (423).
export function SalarieSortie({
  salarieId,
  dateSortie,
  readOnly,
}: {
  salarieId: string;
  // AAAA-MM-JJ, ou chaîne vide quand aucune sortie n'est enregistrée.
  dateSortie: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(dateSortie);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const existante = dateSortie !== '';

  function fermer() {
    setOpen(false);
    setDate(dateSortie);
    setFieldError(null);
    setError(null);
  }

  async function envoyer(valeur: string | null) {
    setError(null);
    setFieldError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/salaries/${salarieId}/sortie`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dateSortie: valeur }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (body?.fields?.dateSortie) setFieldError(body.fields.dateSortie);
        else setError(ERROR_MESSAGES[body?.error] ?? FALLBACK);
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
    if (!date) {
      setFieldError('INVALID_DATE_SORTIE');
      return;
    }
    void envoyer(date);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={readOnly}
        title={readOnly ? 'Votre cabinet est en lecture seule.' : undefined}
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <DoorOpen className="h-4 w-4" />
        {existante ? 'Modifier la sortie' : 'Enregistrer la sortie'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleSubmit}
            noValidate
            role="dialog"
            aria-modal="true"
            aria-labelledby="sortie-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
          >
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <DoorOpen className="h-5 w-5" />
              </span>
              <div>
                <h3 id="sortie-title" className="text-lg font-semibold text-foreground">
                  {existante ? 'Modifier la sortie' : 'Enregistrer la sortie'}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Le dossier reste actif : la dernière fiche de paie reste à préparer. La
                  déclaration DIMONA de sortie sera générée avec le module des déclarations.
                </p>
              </div>
            </div>

            <fieldset disabled={loading} className="mt-5">
              <Field
                id="sortie-date"
                label="Dernier jour de travail"
                error={fieldError ? (DATE_ERRORS[fieldError] ?? 'Valeur invalide.') : undefined}
                hint="Peut être passée ou future, mais pas avant l’entrée du salarié."
              >
                <input
                  id="sortie-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
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
              {existante && (
                <button
                  type="button"
                  onClick={() => void envoyer(null)}
                  disabled={loading}
                  className="rounded-lg border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:mr-auto"
                >
                  Effacer la sortie
                </button>
              )}
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
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
