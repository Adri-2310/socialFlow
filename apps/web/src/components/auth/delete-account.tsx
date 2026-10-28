'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { AlertTriangle, MailCheck } from 'lucide-react';
import { authClient } from '@/lib/auth/auth-client';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/auth/account-retention';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

// `blockedBySubscription` : le titulaire dont l'abonnement court ne peut pas
// supprimer son compte (D67). Le serveur le refuse de toute facon ; on le dit
// avant, plutot que de laisser aller jusqu'a l'erreur.
export function DeleteAccount({ blockedBySubscription = false }: { blockedBySubscription?: boolean }) {
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

  if (blockedBySubscription) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 p-5">
        <p className="text-sm font-semibold text-foreground">Supprimer mon compte</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Vous ne pouvez pas supprimer votre compte tant que l&apos;abonnement de votre cabinet est
          en cours. Résiliez-le d&apos;abord, puis revenez ici une fois l&apos;abonnement terminé.
        </p>
        <Link
          href="/dashboard/cabinet/facturation"
          className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
        >
          Gérer mon abonnement
        </Link>
      </div>
    );
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          className="mt-1 text-muted-foreground hover:text-primary"
        >
          Retour
        </Button>
      </div>
    );
  }

  if (confirming) {
    return (
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-destructive/40 bg-destructive/5 p-5"
      >
        <p className="text-sm font-semibold text-destructive-text">
          Confirmer la suppression de votre compte
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Votre compte sera immédiatement désactivé (données, 2FA et comptes liés inaccessibles).
          Vous disposez de {ACCOUNT_DELETION_RETENTION_DAYS} jours pour contacter le support si
          vous changez d&apos;avis, au-delà desquels la suppression devient définitive.
        </p>

        {hasPassword ? (
          <FormField
            id="delete-password"
            label="Confirmez votre mot de passe"
            required
            error={error}
            className="mt-4"
          >
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            )}
          </FormField>
        ) : (
          <>
            <p className="mt-3 text-xs text-muted-foreground">
              Votre compte n&apos;a pas de mot de passe (connexion via Google/Microsoft) : un email
              de confirmation vous sera envoyé pour finaliser la suppression.
            </p>
            {error && (
              <p role="alert" className="mt-2 text-sm text-destructive-text">
                {error}
              </p>
            )}
          </>
        )}

        <div className="mt-4 flex gap-2">
          <Button type="submit" variant="destructive" disabled={loading} className="flex-1">
            {loading && <Spinner />}
            Recevoir l&apos;email de confirmation
          </Button>
          <Button type="button" variant="outline" onClick={reset}>
            Annuler
          </Button>
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
      <Button
        type="button"
        variant="outline"
        onClick={() => setConfirming(true)}
        disabled={hasPassword === null}
        className="shrink-0 border-destructive/40 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
      >
        Supprimer
      </Button>
    </div>
  );
}
