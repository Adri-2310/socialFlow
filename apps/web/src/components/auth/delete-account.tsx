'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { AlertTriangle, Loader2, MailCheck } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { translateAuthError } from '@/lib/auth-errors';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/account-retention';

export function DeleteAccount() {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authClient.listAccounts().then(({ data }) => {
      setHasPassword(data?.some((account) => account.providerId === 'credential') ?? false);
    });
  }, []);

  function reset() {
    setConfirming(false);
    setEmailSent(false);
    setPassword('');
    setError(null);
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // La suppression n'est plus immediate : un email de confirmation part
    // dans tous les cas (compte avec ou sans mot de passe), et seul le clic
    // sur le lien qu'il contient supprime reellement le compte.
    const { error: deleteError } = await authClient.deleteUser({
      ...(hasPassword ? { password } : {}),
      callbackURL: '/compte-supprime',
    });

    setLoading(false);

    if (deleteError) {
      setError(translateAuthError(deleteError.code));
      return;
    }

    setEmailSent(true);
  }

  if (emailSent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-destructive/15 text-destructive">
          <MailCheck className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Vérifiez votre boîte mail</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Un email de confirmation vous a été envoyé. Cliquez sur le lien qu&apos;il contient
            pour désactiver votre compte — cette étape est nécessaire, rien n&apos;a encore été
            supprimé.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="mt-1 text-sm font-medium text-muted-foreground hover:text-primary"
        >
          Retour
        </button>
      </div>
    );
  }

  if (confirming) {
    return (
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-destructive/40 bg-destructive/5 p-5"
      >
        <p className="text-sm font-semibold text-destructive">
          Confirmer la suppression de votre compte
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Votre compte sera immédiatement désactivé (données, 2FA et comptes liés inaccessibles).
          Vous disposez de {ACCOUNT_DELETION_RETENTION_DAYS} jours pour contacter le support si
          vous changez d&apos;avis, au-delà desquels la suppression devient définitive.
        </p>

        {hasPassword ? (
          <>
            <label
              htmlFor="delete-password"
              className="mt-4 block text-sm font-medium text-foreground"
            >
              Confirmez votre mot de passe
            </label>
            <input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
            />
          </>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Votre compte n&apos;a pas de mot de passe (connexion via Google/Microsoft) : un email
            de confirmation vous sera envoyé pour finaliser la suppression.
          </p>
        )}

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground shadow-lg shadow-destructive/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Recevoir l&apos;email de confirmation
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            Annuler
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-destructive/40 bg-destructive/5 p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-destructive/15 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Supprimer mon compte</p>
          <p className="text-xs text-muted-foreground">
            Désactivation immédiate, suppression définitive après {ACCOUNT_DELETION_RETENTION_DAYS}{' '}
            jours.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={hasPassword === null}
        className="shrink-0 rounded-xl border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Supprimer
      </button>
    </div>
  );
}
