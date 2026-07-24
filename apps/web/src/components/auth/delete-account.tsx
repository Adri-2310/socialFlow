'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { translateAuthError } from '@/lib/auth-errors';

export function DeleteAccount() {
  const router = useRouter();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
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
    setPassword('');
    setError(null);
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: deleteError } = await authClient.deleteUser(
      hasPassword ? { password } : {},
    );

    if (deleteError) {
      setLoading(false);
      setError(translateAuthError(deleteError.code));
      return;
    }

    router.push('/compte-supprime');
    router.refresh();
  }

  if (confirming) {
    return (
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-destructive/40 bg-destructive/5 p-5"
      >
        <p className="text-sm font-semibold text-destructive">
          Confirmer la suppression définitive de votre compte
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Cette action est irréversible : vos données, votre 2FA et vos comptes liés seront
          définitivement supprimés.
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
            Votre compte n&apos;a pas de mot de passe (connexion via Google/Microsoft) : la
            suppression sera immédiate. Si votre session a expiré, reconnectez-vous avant de
            réessayer.
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
            Supprimer définitivement
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
            Suppression définitive de votre compte et de toutes vos données.
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
