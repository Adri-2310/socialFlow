'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { signIn, signUp } from '@/lib/auth-client';
import { translateAuthError } from '@/lib/auth-errors';
import { GoogleIcon, MicrosoftIcon } from '@/components/auth/oauth-icons';
import type { BillingPeriod, PlanId } from '@/lib/plans';

export function RegisterForm({
  planId,
  billingPeriod,
}: {
  planId: PlanId;
  billingPeriod: BillingPeriod;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);

  async function handleGoogleSignUp() {
    setError(null);
    setGoogleLoading(true);

    const { error: googleError } = await signIn.social({
      provider: 'google',
      callbackURL: `/bienvenue?plan=${planId}&billing=${billingPeriod}`,
      requestSignUp: true,
    });

    if (googleError) {
      setGoogleLoading(false);
      setError(translateAuthError(googleError.code));
    }
  }

  async function handleMicrosoftSignUp() {
    setError(null);
    setMicrosoftLoading(true);

    const { error: microsoftError } = await signIn.social({
      provider: 'microsoft',
      callbackURL: `/bienvenue?plan=${planId}&billing=${billingPeriod}`,
      requestSignUp: true,
    });

    if (microsoftError) {
      setMicrosoftLoading(false);
      setError(translateAuthError(microsoftError.code));
    }
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);

    const { error: signUpError } = await signUp.email({
      name,
      email,
      password,
      plan: planId,
      billingPeriod,
    });

    setLoading(false);

    if (signUpError) {
      setError(translateAuthError(signUpError.code));
      return;
    }

    router.push('/bienvenue');
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleGoogleSignUp}
          disabled={googleLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-input py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
          Google
        </button>
        <button
          type="button"
          onClick={handleMicrosoftSignUp}
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

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground">
            Nom complet
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Jean Dupont"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="vous@cabinet.be"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-foreground">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="8 caractères minimum"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
            Confirmer le mot de passe
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Créer mon compte
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Déjà un compte ?{' '}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Se connecter
          </Link>
        </p>
      </form>
    </div>
  );
}
