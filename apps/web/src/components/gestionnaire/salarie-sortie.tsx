'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { DoorOpen } from 'lucide-react';
import { FormDialog } from '@/components/shared/form-dialog';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
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
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={readOnly}
        title={readOnly ? 'Votre cabinet est en lecture seule.' : undefined}
        className="shrink-0"
      >
        <DoorOpen />
        {existante ? 'Modifier la sortie' : 'Enregistrer la sortie'}
      </Button>

      {open && (
        <FormDialog
          icon={<DoorOpen />}
          title={existante ? 'Modifier la sortie' : 'Enregistrer la sortie'}
          description="Le dossier reste actif : la dernière fiche de paie reste à préparer. La déclaration DIMONA de sortie sera générée avec le module des déclarations."
        >
          <form onSubmit={handleSubmit} noValidate>
            <fieldset disabled={loading}>
              <FormField
                id="sortie-date"
                label="Dernier jour de travail"
                error={fieldError ? (DATE_ERRORS[fieldError] ?? 'Valeur invalide.') : undefined}
                hint="Peut être passée ou future, mais pas avant l’entrée du salarié."
              >
                {(c) => (
                  <Input
                    {...c}
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
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
              {existante && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void envoyer(null)}
                  disabled={loading}
                  className="sm:mr-auto"
                >
                  Effacer la sortie
                </Button>
              )}
              <Button type="button" variant="outline" onClick={fermer} disabled={loading}>
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
