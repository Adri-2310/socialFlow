'use client';

import { useEffect, useState } from 'react';
import { Link2, Unlink } from 'lucide-react';
import { authClient } from '@/lib/auth/auth-client';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { GoogleIcon, MicrosoftIcon } from '@/components/auth/oauth-icons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

const PROVIDERS = [
  { id: 'google', label: 'Google', Icon: GoogleIcon },
  { id: 'microsoft', label: 'Microsoft', Icon: MicrosoftIcon },
] as const;

export function LinkedAccounts() {
  const [accounts, setAccounts] = useState<{ providerId: string; id: string }[] | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    authClient.listAccounts().then(({ data }) => {
      if (data) setAccounts(data.map((account) => ({ providerId: account.providerId, id: account.id })));
    });
  }, []);

  async function handleLink(providerId: string) {
    setErrors((prev) => ({ ...prev, [providerId]: '' }));
    setLoadingProvider(providerId);

    const { error: linkError } = await authClient.linkSocial({
      provider: providerId,
      callbackURL: '/dashboard',
    });

    if (linkError) {
      setLoadingProvider(null);
      setErrors((prev) => ({ ...prev, [providerId]: translateAuthError(linkError.code) }));
    }
  }

  async function handleUnlink(providerId: string) {
    const account = accounts?.find((a) => a.providerId === providerId);
    if (!account) return;

    setErrors((prev) => ({ ...prev, [providerId]: '' }));
    setLoadingProvider(providerId);

    const { error: unlinkError } = await authClient.unlinkAccount({ accountId: account.id });

    setLoadingProvider(null);

    if (unlinkError) {
      setErrors((prev) => ({ ...prev, [providerId]: translateAuthError(unlinkError.code) }));
      return;
    }

    setAccounts((prev) => prev?.filter((a) => a.providerId !== providerId) ?? null);
  }

  if (!accounts) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background p-5">
      <p className="text-sm font-semibold text-foreground">Comptes liés</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Connectez un compte Google ou Microsoft pour vous connecter plus rapidement.
      </p>

      <div className="mt-4 space-y-3">
        {PROVIDERS.map(({ id, label, Icon }) => {
          const isLinked = accounts.some((a) => a.providerId === id);
          const isLoading = loadingProvider === id;
          const error = errors[id];

          return (
            <div key={id}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {isLinked ? 'Lié à votre compte.' : 'Non lié.'}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant={isLinked ? 'outline' : 'default'}
                  onClick={() => (isLinked ? handleUnlink(id) : handleLink(id))}
                  disabled={loadingProvider !== null}
                  className="shrink-0"
                >
                  {isLoading ? <Spinner /> : isLinked ? <Unlink /> : <Link2 />}
                  {isLinked ? 'Délier' : 'Lier mon compte'}
                </Button>
              </div>
              {error && (
                <p role="alert" className="mt-1.5 text-sm text-destructive-text">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
