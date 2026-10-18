'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Eye, EyeOff, Loader2 } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: 'Formulaire incomplet.',
  INVALID_TOKEN: "Ce lien d'invitation n'est plus valable.",
  EMAIL_ALREADY_USED: 'Un compte existe déjà avec cette adresse email. Connectez-vous.',
  CABINET_READ_ONLY:
    "Ce cabinet ne peut pas accueillir de nouveau compte pour le moment. Contactez la personne qui vous a invité.",
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
  const [showPassword, setShowPassword] = useState(false);
  // D76 : apres la creation du compte, on affiche l'adresse du portail avant d'entrer.
  const [portal, setPortal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

    const body = await res.json().catch(() => null);
    const raw = typeof body?.portalUrl === 'string' ? body.portalUrl : '';
    if (!raw) {
      router.push('/dashboard');
      router.refresh();
      return;
    }
    setPortal(raw.startsWith('/') ? `${window.location.origin}${raw}` : raw);
  }

  async function copyPortal() {
    if (!portal) return;
    try {
      await navigator.clipboard.writeText(portal);
      setCopied(true);
    } catch {
      // Presse-papiers indisponible : l'adresse reste affichee, on ne bloque rien.
    }
  }

  if (portal) {
    return (
      <div className="space-y-5" role="status">
        <h2 className="text-lg font-semibold text-foreground">Votre compte est créé</h2>
        <p className="text-sm text-muted-foreground">
          Pour vous reconnecter par la suite, utilisez toujours le portail de votre cabinet. Notez
          cette adresse ou ajoutez-la à vos favoris ; nous vous l’envoyons aussi par email.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-input bg-muted px-3 py-2">
          <span aria-label="Adresse du portail" className="min-w-0 flex-1 break-all text-sm text-foreground">
            {portal}
          </span>
          <button
            type="button"
            onClick={copyPortal}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            router.push('/dashboard');
            router.refresh();
          }}
          className="flex w-full items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90"
        >
          Accéder à mon espace
        </button>
      </div>
    );
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
        <div className="relative mt-1.5">
          <input
            id="invite-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-input bg-background py-2 pl-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="8 caractères minimum"
          />
          {/* Un seul bouton pour les deux champs, comme reset-password-form.tsx. */}
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={
              showPassword ? 'Masquer les mots de passe' : 'Afficher les mots de passe'
            }
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="invite-confirm-password" className="block text-sm font-medium text-foreground">
          Confirmer le mot de passe
        </label>
        <input
          id="invite-confirm-password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="••••••••"
        />
      </div>

      {error && <p className="text-sm text-destructive-text">{error}</p>}

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
