'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { authClient } from '@/lib/auth/auth-client';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { portalPath } from '@/lib/portal/portal-slug';
import { FormField } from '@/components/shared/form-field';
import { buttonVariants, Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

// `portal` (D76, D77) : demande faite depuis le portail d'un cabinet - le lien de l'email ramene
// sur une page de CE portail, et « Retour » y retourne, sans page SocialFlow.
export function ForgotPasswordForm({ portal }: { portal?: { slug: string } } = {}) {
  const backHref = portal ? portalPath(portal.slug) : '/login';
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: resetError } = await authClient.requestPasswordReset({
      email,
      redirectTo: portal ? `${portalPath(portal.slug)}/reinitialiser-mot-de-passe` : '/reinitialiser-mot-de-passe',
    });

    setLoading(false);

    if (resetError) {
      setError(translateAuthError(resetError.code));
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <MailCheck aria-hidden="true" className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Vérifiez votre boîte mail</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Si un compte existe avec <span className="font-medium text-foreground">{email}</span>,
            un lien de réinitialisation vient d&apos;être envoyé. Il est valable 1 heure.
          </p>
        </div>
        <Link href={backHref} className={buttonVariants({ variant: 'link' })}>
          <ArrowLeft aria-hidden="true" /> Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField id="email" label="Adresse email" required>
        {(control) => (
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              {...control}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10"
              placeholder="prenom@cabinet.be"
            />
          </div>
        )}
      </FormField>

      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading && <Spinner />}
        Envoyer le lien de réinitialisation
      </Button>

      {/* Lien discret qui prend la couleur du cabinet au survol (D65, D76). */}
      <Link
        href={backHref}
        className={buttonVariants({
          variant: 'ghost',
          size: 'sm',
          className: 'w-full text-muted-foreground hover:bg-transparent hover:text-primary',
        })}
      >
        <ArrowLeft aria-hidden="true" /> Retour à la connexion
      </Link>
    </form>
  );
}
