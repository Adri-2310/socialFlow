'use client';

import type { SubmitEvent } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

// Deuxième étape de la connexion quand la double authentification est active : le code de
// l'application, ou un code de secours. L'état (code saisi, erreur) reste dans LoginForm.
export function TwoFactorChallenge({
  useBackupCode,
  code,
  error,
  loading,
  onCodeChange,
  onSubmit,
  onBack,
  onToggleBackupCode,
}: {
  useBackupCode: boolean;
  code: string;
  error: string | null;
  loading: boolean;
  onCodeChange: (code: string) => void;
  onSubmit: (e: SubmitEvent<HTMLFormElement>) => void;
  onBack: () => void;
  onToggleBackupCode: () => void;
}) {
  return (
    <div className="space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="-ml-3 text-muted-foreground hover:bg-transparent hover:text-primary"
      >
        <ArrowLeft aria-hidden="true" /> Retour
      </Button>

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

      <form onSubmit={onSubmit} className="space-y-4">
        <FormField
          id="twoFactorCode"
          label={useBackupCode ? 'Code de secours' : 'Code à 6 chiffres'}
          required
          error={error}
        >
          {(control) => (
            <Input
              {...control}
              type="text"
              inputMode={useBackupCode ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder={useBackupCode ? 'xxxxxxxx' : '123456'}
            />
          )}
        </FormField>

        <Button type="submit" disabled={loading} className="w-full">
          {loading && <Spinner />}
          Vérifier
        </Button>
      </form>

      <Button type="button" variant="link" onClick={onToggleBackupCode} className="w-full">
        {useBackupCode ? "Utiliser l'application d'authentification" : 'Utiliser un code de secours'}
      </Button>
    </div>
  );
}
