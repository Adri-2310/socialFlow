'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { Check, Copy, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { twoFactor } from '@/lib/auth-client';
import { translateAuthError } from '@/lib/auth-errors';

type Step = 'idle' | 'enable-password' | 'enable-verify' | 'disable-password';

export function TwoFactorSetup({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setStep('idle');
    setPassword('');
    setCode('');
    setQrDataUrl(null);
    setBackupCodes([]);
    setCopied(false);
    setError(null);
  }

  async function handleEnableSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: enableError } = await twoFactor.enable({ password });

    if (enableError) {
      setLoading(false);
      setError(translateAuthError(enableError.code));
      return;
    }

    const dataUrl = await QRCode.toDataURL(data.totpURI);

    setLoading(false);
    setQrDataUrl(dataUrl);
    setBackupCodes(data.backupCodes);
    setPassword('');
    setStep('enable-verify');
  }

  async function handleVerifySubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: verifyError } = await twoFactor.verifyTotp({ code });

    setLoading(false);

    if (verifyError) {
      setError(translateAuthError(verifyError.code));
      return;
    }

    reset();
    router.refresh();
  }

  async function handleDisableSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: disableError } = await twoFactor.disable({ password });

    setLoading(false);

    if (disableError) {
      setError(translateAuthError(disableError.code));
      return;
    }

    reset();
    router.refresh();
  }

  function copyBackupCodes() {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (step === 'enable-verify') {
    return (
      <div className="rounded-xl border border-border/60 bg-background p-5">
        <p className="text-sm font-semibold text-foreground">
          Scannez ce QR code avec votre application d&apos;authentification
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Google Authenticator, Microsoft Authenticator, 1Password…
        </p>

        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="QR code d'activation de la double authentification"
            className="mx-auto mt-4 h-44 w-44 rounded-lg border border-border/60 bg-white p-2"
          />
        )}

        <div className="mt-4 rounded-lg border border-border/60 bg-muted/50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Codes de secours</p>
            <button
              type="button"
              onClick={copyBackupCodes}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copié' : 'Copier'}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Conservez-les en lieu sûr : ils permettent de vous reconnecter si vous perdez l&apos;accès
            à votre application.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-xs text-foreground">
            {backupCodes.map((backupCode) => (
              <span key={backupCode} className="rounded bg-background px-2 py-1">
                {backupCode}
              </span>
            ))}
          </div>
        </div>

        <form onSubmit={handleVerifySubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="totp-code" className="block text-sm font-medium text-foreground">
              Code à 6 chiffres
            </label>
            <input
              id="totp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="123456"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmer
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (step === 'enable-password' || step === 'disable-password') {
    const isEnabling = step === 'enable-password';
    return (
      <form
        onSubmit={isEnabling ? handleEnableSubmit : handleDisableSubmit}
        className="rounded-xl border border-border/60 bg-background p-5"
      >
        <label htmlFor="2fa-password" className="block text-sm font-medium text-foreground">
          Confirmez votre mot de passe
        </label>
        <input
          id="2fa-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="••••••••"
        />

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isEnabling
                ? 'bg-primary text-primary-foreground shadow-primary/20 hover:opacity-90'
                : 'bg-destructive text-destructive-foreground shadow-destructive/20 hover:opacity-90'
            }`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEnabling ? 'Continuer' : 'Désactiver la 2FA'}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            Annuler
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background p-5">
      <div className="flex items-center gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
            enabled ? 'bg-secondary/15 text-secondary' : 'bg-muted text-muted-foreground'
          }`}
        >
          {enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Double authentification</p>
          <p className="text-xs text-muted-foreground">
            {enabled ? 'Activée sur votre compte.' : 'Non activée.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setStep(enabled ? 'disable-password' : 'enable-password')}
        className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${
          enabled
            ? 'border border-input text-foreground hover:bg-muted'
            : 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90'
        }`}
      >
        {enabled ? 'Désactiver' : 'Activer'}
      </button>
    </div>
  );
}
