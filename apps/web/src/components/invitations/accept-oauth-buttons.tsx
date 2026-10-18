'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { signIn } from '@/lib/auth-client';
import { translateAuthError } from '@/lib/auth-errors';
import { GoogleIcon, MicrosoftIcon } from '@/components/auth/oauth-icons';

type Provider = 'google' | 'microsoft';

// Acceptation d'une invitation avec Google ou Microsoft (C4). On revient sur la
// meme page d'invitation : si l'adresse du compte est celle de l'invitation, la
// page rattache alors le compte au cabinet (voir FinalizeOAuthInvitation).
export function AcceptOAuthButtons({ token }: { token: string }) {
  const [loading, setLoading] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(provider: Provider) {
    setError(null);
    setLoading(provider);
    const { error: oauthError } = await signIn.social({
      provider,
      callbackURL: `/invitations/accept?token=${encodeURIComponent(token)}`,
      requestSignUp: true,
    });
    if (oauthError) {
      setLoading(null);
      setError(translateAuthError(oauthError.code));
    }
  }

  const buttonClass =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-input py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => start('google')} disabled={loading !== null} className={buttonClass}>
          {loading === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
          Google
        </button>
        <button type="button" onClick={() => start('microsoft')} disabled={loading !== null} className={buttonClass}>
          {loading === 'microsoft' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MicrosoftIcon className="h-4 w-4" />
          )}
          Microsoft
        </button>
      </div>
      {error && <p className="text-sm text-destructive-text">{error}</p>}
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">ou avec un mot de passe</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
