'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import { authClient } from '@/lib/auth/auth-client';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { portalPath } from '@/lib/portal/portal-slug';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

// `portal` (D76, D77) : page ouverte depuis le portail d'un cabinet - on y retourne pour se connecter.
export function ResetPasswordForm({ portal }: { portal?: { slug: string } } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const tokenError = searchParams.get('error');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    tokenError ? translateAuthError(tokenError) : null,
  );
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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

    if (!token) {
      setError('Lien de réinitialisation invalide ou expiré.');
      return;
    }

    setLoading(true);

    const { error: resetError } = await authClient.resetPassword({
      newPassword: password,
      token,
    });

    setLoading(false);

    if (resetError) {
      setError(translateAuthError(resetError.code));
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        {/* D62 : le teal `secondary` n'est pas lisible en texte ni en icône, on prend l'émeraude. */}
        <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 aria-hidden="true" className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Mot de passe mis à jour</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
          </p>
        </div>
        <Button
          type="button"
          className="mt-2 w-full"
          onClick={() => {
            router.push(portal ? portalPath(portal.slug) : '/login');
            router.refresh();
          }}
        >
          Se connecter
        </Button>
      </div>
    );
  }

  // Une seule erreur pour tout le formulaire (règles locales, lien, serveur) : elle est reliée aux
  // deux champs plutôt qu'à un seul.
  const errorProps = error
    ? ({ 'aria-invalid': true, 'aria-describedby': 'reset-password-error' } as const)
    : {};

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField id="password" label="Nouveau mot de passe" required>
        {(control) => (
          <div className="relative">
            <Lock
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              {...control}
              {...errorProps}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 pr-10"
              placeholder="8 caractères minimum"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        )}
      </FormField>

      <FormField id="confirmPassword" label="Confirmer le mot de passe" required>
        {(control) => (
          <div className="relative">
            <Lock
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              {...control}
              {...errorProps}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10"
              placeholder="••••••••"
            />
          </div>
        )}
      </FormField>

      {error && (
        <p id="reset-password-error" role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading || !token} className="w-full">
        {loading && <Spinner />}
        Réinitialiser le mot de passe
      </Button>
    </form>
  );
}
