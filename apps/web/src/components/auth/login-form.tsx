'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { signIn, twoFactor } from '@/lib/auth-client';
import { translateAuthError } from '@/lib/auth-errors';
import { GoogleIcon, MicrosoftIcon } from '@/components/auth/oauth-icons';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);

    const { error: googleError } = await signIn.social({
      provider: 'google',
      callbackURL: '/bienvenue',
    });

    if (googleError) {
      setGoogleLoading(false);
      setError(translateAuthError(googleError.code));
    }
  }

  async function handleMicrosoftSignIn() {
    setError(null);
    setMicrosoftLoading(true);

    const { error: microsoftError } = await signIn.social({
      provider: 'microsoft',
      callbackURL: '/bienvenue',
    });

    if (microsoftError) {
      setMicrosoftLoading(false);
      setError(translateAuthError(microsoftError.code));
    }
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: signInError } = await signIn.email({ email, password });

    setLoading(false);

    if (signInError) {
      setError(translateAuthError(signInError.code));
      return;
    }

    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setNeedsTwoFactor(true);
      return;
    }

    router.push('/bienvenue');
    router.refresh();
  }

  async function handleTwoFactorSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: verifyError } = useBackupCode
      ? await twoFactor.verifyBackupCode({ code: twoFactorCode })
      : await twoFactor.verifyTotp({ code: twoFactorCode });

    setLoading(false);

    if (verifyError) {
      setError(translateAuthError(verifyError.code));
      return;
    }

    router.push('/bienvenue');
    router.refresh();
  }

  if (needsTwoFactor) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => {
            setNeedsTwoFactor(false);
            setError(null);
            setTwoFactorCode('');
          }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>

        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Vérification en deux étapes</p>
            <p className="text-xs text-muted-foreground">
              {useBackupCode
                ? 'Saisissez un de vos codes de secours.'
                : "Saisissez le code de votre application d'authentification."}
            </p>
          </div>
        </div>

        <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
          <div>
            <label htmlFor="twoFactorCode" className="mb-1.5 block text-sm font-medium text-foreground">
              {useBackupCode ? 'Code de secours' : 'Code à 6 chiffres'}
            </label>
            <input
              id="twoFactorCode"
              type="text"
              inputMode={useBackupCode ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              required
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={useBackupCode ? 'xxxxxxxx' : '123456'}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Vérifier
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setUseBackupCode((v) => !v);
            setError(null);
            setTwoFactorCode('');
          }}
          className="w-full text-center text-sm font-medium text-primary hover:underline"
        >
          {useBackupCode ? "Utiliser l'application d'authentification" : 'Utiliser un code de secours'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-input py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
          Google
        </button>
        <button
          type="button"
          onClick={handleMicrosoftSignIn}
          disabled={microsoftLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-input py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {microsoftLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MicrosoftIcon className="h-4 w-4" />}
          Microsoft
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">ou avec votre e-mail</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
            Adresse email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="prenom@cabinet.be"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              Mot de passe
            </label>
            <span
              className="text-xs font-medium text-muted-foreground/60"
              title="Bientôt disponible"
            >
              Oublié ?
            </span>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" />
          Rester connecté
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Se connecter
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Pas encore de compte ?{' '}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Créer un compte
        </Link>
      </p>
    </div>
  );
}
