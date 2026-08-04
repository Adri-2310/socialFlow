'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: 'Formulaire incomplet.',
  INVALID_TOKEN: "Ce lien d'invitation n'est plus valable.",
  PASSWORD_TOO_SHORT: 'Le mot de passe doit contenir au moins 8 caractères.',
  PASSWORD_TOO_LONG: 'Le mot de passe est trop long.',
};

export function AcceptInvitationForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

    const res = await fetch('/api/invitations/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, name, password }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(ERROR_MESSAGES[body?.error ?? body?.code] ?? 'Une erreur est survenue. Veuillez réessayer.');
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="invite-email" className="block text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          disabled
          className="mt-1.5 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
        />
      </div>

      <div>
        <label htmlFor="invite-name" className="block text-sm font-medium text-foreground">
          Nom complet
        </label>
        <input
          id="invite-name"
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
        <label htmlFor="invite-password" className="block text-sm font-medium text-foreground">
          Mot de passe
        </label>
        <input
          id="invite-password"
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
        <label htmlFor="invite-confirm-password" className="block text-sm font-medium text-foreground">
          Confirmer le mot de passe
        </label>
        <input
          id="invite-confirm-password"
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
    </form>
  );
}
