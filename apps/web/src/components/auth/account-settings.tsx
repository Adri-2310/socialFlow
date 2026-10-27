'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Eye, EyeOff, KeyRound, Mail, Pencil, User, X } from 'lucide-react';
import { authClient } from '@/lib/auth/auth-client';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { Notice } from '@/components/shared/notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

type Field = 'name' | 'email' | 'password' | null;

// Bouton « Modifier » commun aux trois lignes : texte à la couleur du cabinet, sur fond neutre.
function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="text-xs text-primary hover:bg-primary/10 hover:text-primary"
    >
      <Pencil className="size-3.5" /> Modifier
    </Button>
  );
}

// Message d'échec d'un champ : annoncé aux lecteurs d'écran et rattaché au champ par `id`.
function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm text-destructive-text">
      {children}
    </p>
  );
}

function NameRow({
  name,
  editing,
  onEdit,
  onClose,
}: {
  name: string;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: updateError } = await authClient.updateUser({ name: value });

    setLoading(false);

    if (updateError) {
      setError(translateAuthError(updateError.code));
      return;
    }

    onClose();
    router.refresh();
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="py-3">
        <Label htmlFor="account-name" className="text-xs font-medium text-muted-foreground">
          Nom
        </Label>
        <div className="mt-1.5 flex gap-2">
          <Input
            id="account-name"
            type="text"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'account-name-error' : undefined}
            className="flex-1"
          />
          <Button type="submit" size="icon-lg" disabled={loading} aria-label="Enregistrer le nom">
            {loading ? <Spinner /> : <Check />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="Annuler la modification du nom"
            onClick={() => {
              setValue(name);
              setError(null);
              onClose();
            }}
          >
            <X />
          </Button>
        </div>
        {error && <FieldError id="account-name-error">{error}</FieldError>}
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">
          <User className="h-4 w-4 text-muted-foreground" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">Nom</p>
          <p className="text-sm font-medium text-foreground">{name}</p>
        </div>
      </div>
      <EditButton onClick={onEdit} />
    </div>
  );
}

function EmailRow({
  email,
  emailVerified,
  editing,
  onEdit,
  onClose,
}: {
  email: string;
  emailVerified: boolean;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleResend() {
    setError(null);
    setResending(true);

    const { error: resendError } = await authClient.sendVerificationEmail({
      email,
      callbackURL: '/dashboard',
    });

    setResending(false);

    if (resendError) {
      setError(translateAuthError(resendError.code));
      return;
    }

    setResent(true);
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: changeError } = await authClient.changeEmail({
      newEmail: value,
      callbackURL: '/dashboard',
    });

    setLoading(false);

    if (changeError) {
      setError(translateAuthError(changeError.code));
      return;
    }

    setSent(true);
  }

  function close() {
    setValue('');
    setError(null);
    setSent(false);
    onClose();
  }

  if (editing) {
    if (sent) {
      return (
        <div className="py-3">
          <p className="text-sm text-foreground">
            Un email de confirmation a été envoyé à <span className="font-medium">{value}</span>{' '}
            (et/ou à votre adresse actuelle selon votre statut de vérification). Suivez le lien pour
            finaliser le changement.
          </p>
          <Button type="button" variant="link" size="sm" onClick={close} className="mt-2 px-0">
            Fermer
          </Button>
        </div>
      );
    }

    return (
      <form onSubmit={handleSubmit} className="py-3">
        <Label htmlFor="account-email" className="text-xs font-medium text-muted-foreground">
          Nouvelle adresse email
        </Label>
        <div className="mt-1.5 flex gap-2">
          <Input
            id="account-email"
            type="email"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={email}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'account-email-error' : undefined}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon-lg"
            disabled={loading}
            aria-label="Enregistrer la nouvelle adresse"
          >
            {loading ? <Spinner /> : <Check />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="Annuler le changement d'adresse"
            onClick={close}
          >
            <X />
          </Button>
        </div>
        {error && <FieldError id="account-email-error">{error}</FieldError>}
      </form>
    );
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">
            <Mail className="h-4 w-4 text-muted-foreground" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="text-sm font-medium text-foreground">{email}</p>
          </div>
        </div>
        <EditButton onClick={onEdit} />
      </div>

      {!emailVerified && (
        <Notice
          tone="warning"
          icon={<AlertTriangle aria-hidden="true" className="size-4" />}
          className="mt-3 rounded-lg px-3 py-2"
          action={
            !resent && (
              <Button
                type="button"
                variant="link"
                size="xs"
                onClick={handleResend}
                disabled={resending}
                className="h-auto p-0"
              >
                {resending && <Spinner className="size-3" />}
                Renvoyer
              </Button>
            )
          }
        >
          {resent ? 'Email de vérification renvoyé.' : 'Email non vérifié.'}
        </Notice>
      )}
      {error && <FieldError id="account-email-error">{error}</FieldError>}
    </div>
  );
}

function PasswordRow({
  editing,
  onEdit,
  onClose,
}: {
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setCurrentPassword('');
    setNewPassword('');
    setError(null);
    onClose();
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    setLoading(true);

    const { error: changeError } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });

    setLoading(false);

    if (changeError) {
      setError(translateAuthError(changeError.code));
      return;
    }

    reset();
    router.refresh();
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="space-y-3 py-3">
        <div>
          <Label htmlFor="current-password" className="text-xs font-medium text-muted-foreground">
            Mot de passe actuel
          </Label>
          <Input
            id="current-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1.5"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="new-password" className="text-xs font-medium text-muted-foreground">
              Nouveau mot de passe
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowPassword((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          <Input
            id="new-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="8 caractères minimum"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'password-error' : undefined}
            className="mt-1.5"
          />
        </div>

        {error && <FieldError id="password-error">{error}</FieldError>}

        <div className="flex gap-2">
          <Button type="submit" disabled={loading} className="flex-1">
            {loading && <Spinner />}
            Mettre à jour
          </Button>
          <Button type="button" variant="outline" onClick={reset}>
            Annuler
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">Mot de passe</p>
          <p className="text-sm font-medium text-foreground">••••••••</p>
        </div>
      </div>
      <EditButton onClick={onEdit} />
    </div>
  );
}

export function AccountSettings({
  name,
  email,
  emailVerified,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
}) {
  const [editing, setEditing] = useState<Field>(null);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useEffect(() => {
    authClient.listAccounts().then(({ data }) => {
      setHasPassword(data?.some((account) => account.providerId === 'credential') ?? false);
    });
  }, []);

  function close() {
    setEditing(null);
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background p-5">
      <p className="text-sm font-semibold text-foreground">Informations du compte</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Modifiez votre nom, votre adresse email ou votre mot de passe.
      </p>

      <div className="mt-4 divide-y divide-border/60">
        <NameRow
          name={name}
          editing={editing === 'name'}
          onEdit={() => setEditing('name')}
          onClose={close}
        />
        <EmailRow
          email={email}
          emailVerified={emailVerified}
          editing={editing === 'email'}
          onEdit={() => setEditing('email')}
          onClose={close}
        />
        {hasPassword && (
          <PasswordRow
            editing={editing === 'password'}
            onEdit={() => setEditing('password')}
            onClose={close}
          />
        )}
      </div>
    </div>
  );
}
