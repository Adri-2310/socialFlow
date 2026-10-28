'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, Link2, Mail, MailCheck } from 'lucide-react';
import { authClient } from '@/lib/auth/auth-client';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { PORTAL_HEADER, portalPath } from '@/lib/portal/portal-slug';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

type Step = 'email' | 'sent' | 'otp';

// Lien « Retour » : texte discret qui prend la couleur du cabinet au survol (D65, D76).
const BACK_BUTTON = 'text-muted-foreground hover:bg-transparent hover:text-primary';

// `portal` : connexion par le portail d'un cabinet (D76), voir login-form.tsx.
export function PasswordlessLogin({
  onBack,
  portal,
}: {
  onBack: () => void;
  portal?: { slug: string };
}) {
  const router = useRouter();
  const portalOptions = portal ? { headers: { [PORTAL_HEADER]: portal.slug } } : undefined;
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<'link' | 'code' | 'verify' | null>(null);

  async function handleSendLink(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoadingAction('link');

    // L'adresse de retour du lien dit au serveur par quel portail on entre, meme si
    // l'email est ouvert dans un autre navigateur.
    const { error: linkError } = await authClient.signIn.magicLink({
      email,
      callbackURL: portal ? `${portalPath(portal.slug)}/continuer` : '/bienvenue',
    });

    setLoadingAction(null);

    if (linkError) {
      setError(translateAuthError(linkError.code));
      return;
    }

    setStep('sent');
  }

  async function handleSendCode() {
    setError(null);
    setLoadingAction('code');

    const { error: otpError } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: 'sign-in',
    });

    setLoadingAction(null);

    if (otpError) {
      setError(translateAuthError(otpError.code));
      return;
    }

    setStep('otp');
  }

  async function handleVerifyCode(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoadingAction('verify');

    const { error: verifyError } = await authClient.signIn.emailOtp({ email, otp: code }, portalOptions);

    setLoadingAction(null);

    if (verifyError) {
      setError(translateAuthError(verifyError.code));
      return;
    }

    router.push(portal ? '/dashboard' : '/bienvenue');
    router.refresh();
  }

  if (step === 'sent') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Vérifiez votre boîte mail</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Un lien de connexion a été envoyé à <span className="font-medium text-foreground">{email}</span>.
              Il est valable 5 minutes.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="link"
          onClick={handleSendCode}
          disabled={loadingAction !== null}
          className="w-full"
        >
          Recevoir un code à la place
        </Button>

        {error && (
          <p role="alert" className="text-center text-sm text-destructive-text">
            {error}
          </p>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setStep('email')}
          className={`w-full ${BACK_BUTTON}`}
        >
          <ArrowLeft aria-hidden="true" /> Retour
        </Button>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <div className="space-y-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setStep('email')}
          className={`-ml-3 ${BACK_BUTTON}`}
        >
          <ArrowLeft aria-hidden="true" /> Retour
        </Button>

        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Code de connexion</p>
            <p className="text-xs text-muted-foreground">
              Saisissez le code envoyé à {email}.
            </p>
          </div>
        </div>

        <form onSubmit={handleVerifyCode} className="space-y-4">
          <FormField id="otp-code" label="Code à 6 chiffres" required error={error}>
            {(control) => (
              <Input
                {...control}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
              />
            )}
          </FormField>

          <Button type="submit" disabled={loadingAction !== null} className="w-full">
            {loadingAction === 'verify' && <Spinner />}
            Vérifier
          </Button>
        </form>

        <Button
          type="button"
          variant="link"
          onClick={handleSendCode}
          disabled={loadingAction !== null}
          className="w-full"
        >
          Renvoyer le code
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className={`-ml-3 ${BACK_BUTTON}`}
      >
        <ArrowLeft aria-hidden="true" /> Se connecter avec un mot de passe
      </Button>

      <form onSubmit={handleSendLink} className="space-y-4">
        <FormField id="passwordless-email" label="Adresse email" required>
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

        <Button type="submit" disabled={loadingAction !== null} className="w-full">
          {loadingAction === 'link' ? <Spinner /> : <Link2 aria-hidden="true" />}
          Recevoir un lien de connexion
        </Button>
      </form>

      <Button
        type="button"
        variant="link"
        onClick={handleSendCode}
        disabled={loadingAction !== null || !email}
        className="w-full"
      >
        {loadingAction === 'code' ? 'Envoi du code…' : 'Recevoir un code à la place'}
      </Button>
    </div>
  );
}
