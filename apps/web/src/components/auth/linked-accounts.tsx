'use client';

import { useEffect, useState } from 'react';
import { Link2, Loader2, Unlink } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { translateAuthError } from '@/lib/auth-errors';
import { GoogleIcon, MicrosoftIcon } from '@/components/auth/oauth-icons';

const PROVIDERS = [
  { id: 'google', label: 'Google', Icon: GoogleIcon },
  { id: 'microsoft', label: 'Microsoft', Icon: MicrosoftIcon },
] as const;

export function LinkedAccounts() {
  const [providerIds, setProviderIds] = useState<string[] | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    authClient.listAccounts().then(({ data }) => {
      if (data) setProviderIds(data.map((account) => account.providerId));
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
    setErrors((prev) => ({ ...prev, [providerId]: '' }));
    setLoadingProvider(providerId);

    const { error: unlinkError } = await authClient.unlinkAccount({ providerId });

    setLoadingProvider(null);

    if (unlinkError) {
      setErrors((prev) => ({ ...prev, [providerId]: translateAuthError(unlinkError.code) }));
      return;
    }

    setProviderIds((prev) => prev?.filter((id) => id !== providerId) ?? null);
  }

  if (!providerIds) {
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
          const isLinked = providerIds.includes(id);
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
                <button
                  type="button"
                  onClick={() => (isLinked ? handleUnlink(id) : handleLink(id))}
                  disabled={loadingProvider !== null}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    isLinked
                      ? 'border border-input text-foreground hover:bg-muted'
                      : 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90'
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isLinked ? (
                    <Unlink className="h-4 w-4" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  {isLinked ? 'Délier' : 'Lier mon compte'}
                </button>
              </div>
              {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
