'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn, signUp } from '@/lib/auth/auth-client';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { SocialSignupButtons } from '@/components/auth/social-signup-buttons';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { BillingPeriod, PlanId } from '@/lib/billing/plans';

export function RegisterForm({
  planId,
  billingPeriod,
}: {
  planId: PlanId;
  billingPeriod: BillingPeriod;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [cabinetName, setCabinetName] = useState('');
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
      cabinetName,
      email,
      password,
    });

    setLoading(false);

    if (signUpError) {
      setError(translateAuthError(signUpError.code));
      return;
    }

    // Le cabinet existe deja : /bienvenue y pose le plan choisi.
    router.push(`/bienvenue?plan=${planId}&billing=${billingPeriod}`);
    router.refresh();
  }

  // Une seule erreur pour tout le formulaire (règles locales, serveur, Google, Microsoft) : elle
  // est reliée aux deux champs mot de passe, les seuls que les règles locales mettent en cause.
  const errorProps = error
    ? ({ 'aria-invalid': true, 'aria-describedby': 'register-error' } as const)
    : {};

  return (
    <div className="space-y-5">
      <SocialSignupButtons
        googleLoading={googleLoading}
        microsoftLoading={microsoftLoading}
        onGoogle={handleGoogleSignUp}
        onMicrosoft={handleMicrosoftSignUp}
      />

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">ou avec votre e-mail</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField id="name" label="Nom complet" required>
          {(control) => (
            <Input
              {...control}
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jean Dupont"
            />
          )}
        </FormField>

        <FormField id="cabinetName" label="Nom du cabinet" required>
          {(control) => (
            <Input
              {...control}
              type="text"
              autoComplete="organization"
              required
              value={cabinetName}
              onChange={(e) => setCabinetName(e.target.value)}
              placeholder="Cabinet Dupont & Associés"
            />
          )}
        </FormField>

        <FormField id="email" label="Email" required>
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@cabinet.be"
            />
          )}
        </FormField>

        <FormField id="password" label="Mot de passe" required>
          {(control) => (
            <Input
              {...control}
              {...errorProps}
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
            />
          )}
        </FormField>

        <FormField id="confirmPassword" label="Confirmer le mot de passe" required>
          {(control) => (
            <Input
              {...control}
              {...errorProps}
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
          )}
        </FormField>

        {error && (
          <p id="register-error" role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading} size="lg" className="w-full">
          {loading && <Spinner />}
          Créer mon compte
        </Button>

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
