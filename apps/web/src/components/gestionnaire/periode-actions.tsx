'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Loader2, Lock, LockOpen } from 'lucide-react';
import { Field, inputClass } from '@/components/gestionnaire/form-field';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  FALLBACK,
  PERIODE_ERROR_MESSAGES,
  PERIODE_FIELD_ERRORS,
} from '@/lib/periode/periode-messages';

const BOUTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60';

// Actions d'une période (D90, D91) : décaler la date limite, verrouiller et déverrouiller les
// prestations. `readOnly` évite un aller-retour inutile : le serveur reste seul juge (423).
export function PeriodeActions({
  periodeId,
  verrouillee,
  dateLimite,
  readOnly,
}: {
  periodeId: string;
  verrouillee: boolean;
  // AAAA-MM-JJ
  dateLimite: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<'date' | 'verrou' | null>(null);
  const [date, setDate] = useState(dateLimite);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function fermer() {
    setDialog(null);
    setDate(dateLimite);
    setFieldError(null);
    setError(null);
  }

  async function envoyer(url: string, init: RequestInit) {
    setError(null);
    setFieldError(null);
    setLoading(true);
    try {
      const res = await fetch(url, init);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (body?.fields?.dateLimite) setFieldError(body.fields.dateLimite);
        else setError(PERIODE_ERROR_MESSAGES[body?.error] ?? FALLBACK);
        return;
      }
      router.refresh();
      setDialog(null);
    } catch {
      setError(FALLBACK);
    } finally {
      setLoading(false);
    }
  }

  function handleDate(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!date) {
      setFieldError('INVALID_DATE_LIMITE');
      return;
    }
    void envoyer(`/api/periodes/${periodeId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dateLimite: date }),
    });
  }

  const titreLecture = readOnly ? 'Votre cabinet est en lecture seule.' : undefined;

  return (
    <>
      {!verrouillee && (
        <button
          type="button"
          onClick={() => setDialog('date')}
          disabled={readOnly}
          title={titreLecture}
          className={BOUTON}
        >
          <CalendarClock className="h-3.5 w-3.5" /> Décaler la date
        </button>
      )}
      <button
        type="button"
        onClick={() => setDialog('verrou')}
        disabled={readOnly}
        title={titreLecture}
        className={BOUTON}
      >
        {verrouillee ? (
          <>
            <LockOpen className="h-3.5 w-3.5" /> Déverrouiller
          </>
        ) : (
          <>
            <Lock className="h-3.5 w-3.5" /> Verrouiller
          </>
        )}
      </button>

      {dialog === 'verrou' && (
        <ConfirmDialog
          title={verrouillee ? 'Déverrouiller les prestations ?' : 'Verrouiller les prestations ?'}
          description={
            verrouillee
              ? 'Les prestations pourront de nouveau être modifiées. Cette action est enregistrée dans le journal.'
              : 'Plus personne ne pourra modifier les prestations de cette période, vous non plus, jusqu’à ce que vous les déverrouilliez.'
          }
          confirmLabel={verrouillee ? 'Déverrouiller' : 'Verrouiller'}
          loading={loading}
          onCancel={fermer}
          onConfirm={() =>
            void envoyer(`/api/periodes/${periodeId}/verrouillage`, {
              method: verrouillee ? 'DELETE' : 'PUT',
            })
          }
        />
      )}
      {dialog === 'verrou' && error && (
        <p
          role="alert"
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-card px-4 py-2 text-sm text-destructive-text shadow-xl"
        >
          {error}
        </p>
      )}

      {dialog === 'date' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleDate}
            noValidate
            role="dialog"
            aria-modal="true"
            aria-labelledby="periode-date-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
          >
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div>
                <h3 id="periode-date-title" className="text-lg font-semibold text-foreground">
                  Décaler la date limite
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ne concerne que cette période : la règle de l’entreprise ne change pas.
                </p>
              </div>
            </div>

            <fieldset disabled={loading} className="mt-5">
              <Field
                id="periode-date"
                label="Date limite des prestations"
                error={
                  fieldError ? (PERIODE_FIELD_ERRORS[fieldError] ?? 'Valeur invalide.') : undefined
                }
                hint="Après cette date, l’entreprise ne modifie plus ; vous pouvez encore compléter et corriger."
              >
                <input
                  id="periode-date"
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
