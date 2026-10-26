'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Lock, LockOpen } from 'lucide-react';
import { FormDialog } from '@/components/shared/form-dialog';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  FALLBACK,
  PERIODE_ERROR_MESSAGES,
  PERIODE_FIELD_ERRORS,
} from '@/lib/periode/periode-messages';

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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialog('date')}
          disabled={readOnly}
          title={titreLecture}
          className="text-xs"
        >
          <CalendarClock /> Décaler la date
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setDialog('verrou')}
        disabled={readOnly}
        title={titreLecture}
        className="text-xs"
      >
        {verrouillee ? (
          <>
            <LockOpen /> Déverrouiller
          </>
        ) : (
          <>
            <Lock /> Verrouiller
          </>
        )}
      </Button>

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
        <FormDialog
          icon={<CalendarClock />}
          title="Décaler la date limite"
          description="Ne concerne que cette période : la règle de l’entreprise ne change pas."
        >
          <form onSubmit={handleDate} noValidate>
            <fieldset disabled={loading}>
              <FormField
                id="periode-date"
                label="Date limite des prestations"
                error={
                  fieldError ? (PERIODE_FIELD_ERRORS[fieldError] ?? 'Valeur invalide.') : undefined
                }
                hint="Après cette date, l’entreprise ne modifie plus ; vous pouvez encore compléter et corriger."
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
