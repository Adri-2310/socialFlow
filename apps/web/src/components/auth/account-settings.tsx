'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, EyeOff, KeyRound, Loader2, Mail, Pencil, User, X } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { translateAuthError } from '@/lib/auth-errors';

type Field = 'name' | 'email' | 'password' | null;

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
        <label htmlFor="account-name" className="block text-xs font-medium text-muted-foreground">
          Nom
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="account-name"
            type="text"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={loading}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(name);
              setError(null);
              onClose();
            }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-input text-foreground transition hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
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
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10"
      >
        <Pencil className="h-3.5 w-3.5" /> Modifier
      </button>
    </div>
  );
}

function EmailRow({
  email,
  editing,
  onEdit,
  onClose,
}: {
  email: string;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

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
          <button
            type="button"
            onClick={close}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            Fermer
          </button>
        </div>
      );
    }

    return (
      <form onSubmit={handleSubmit} className="py-3">
        <label htmlFor="account-email" className="block text-xs font-medium text-muted-foreground">
          Nouvelle adresse email
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="account-email"
            type="email"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={email}
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={loading}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={close}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-input text-foreground transition hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">
          <Mail className="h-4 w-4 text-muted-foreground" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">Email</p>
          <p className="text-sm font-medium text-foreground">{email}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10"
      >
        <Pencil className="h-3.5 w-3.5" /> Modifier
      </button>
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
          <label
            htmlFor="current-password"
            className="block text-xs font-medium text-muted-foreground"
          >
            Mot de passe actuel
          </label>
          <input
            id="current-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="new-password"
              className="block text-xs font-medium text-muted-foreground"
            >
              Nouveau mot de passe
            </label>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <input
            id="new-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="8 caractères minimum"
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Mettre à jour
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-input px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            Annuler
          </button>
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
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10"
      >
        <Pencil className="h-3.5 w-3.5" /> Modifier
      </button>
    </div>
  );
}

export function AccountSettings({ name, email }: { name: string; email: string }) {
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
