'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, Link2, Loader2, Mail, MailCheck } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { translateAuthError } from '@/lib/auth-errors';

type Step = 'email' | 'sent' | 'otp';

export function PasswordlessLogin({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<'link' | 'code' | 'verify' | null>(null);

  async function handleSendLink(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoadingAction('link');

    const { error: linkError } = await authClient.signIn.magicLink({
      email,
      callbackURL: '/bienvenue',
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

    const { error: verifyError } = await authClient.signIn.emailOtp({ email, otp: code });

    setLoadingAction(null);

    if (verifyError) {
      setError(translateAuthError(verifyError.code));
      return;
    }

    router.push('/bienvenue');
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

        <button
          type="button"
          onClick={handleSendCode}
          disabled={loadingAction !== null}
          className="w-full text-center text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          Recevoir un code à la place
        </button>

        {error && <p className="text-center text-sm text-destructive">{error}</p>}

        <button
          type="button"
          onClick={() => setStep('email')}
          className="inline-flex w-full items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setStep('email')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>

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
          <div>
            <label htmlFor="otp-code" className="mb-1.5 block text-sm font-medium text-foreground">
              Code à 6 chiffres
            </label>
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="123456"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loadingAction !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingAction === 'verify' && <Loader2 className="h-4 w-4 animate-spin" />}
            Vérifier
          </button>
        </form>

        <button
          type="button"
          onClick={handleSendCode}
          disabled={loadingAction !== null}
          className="w-full text-center text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          Renvoyer le code
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Se connecter avec un mot de passe
      </button>

      <form onSubmit={handleSendLink} className="space-y-4">
        <div>
          <label htmlFor="passwordless-email" className="mb-1.5 block text-sm font-medium text-foreground">
            Adresse email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="passwordless-email"
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loadingAction !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingAction === 'link' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          Recevoir un lien de connexion
        </button>
      </form>

      <button
        type="button"
        onClick={handleSendCode}
        disabled={loadingAction !== null || !email}
        className="w-full text-center text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loadingAction === 'code' ? 'Envoi du code…' : 'Recevoir un code à la place'}
      </button>
    </div>
  );
}
