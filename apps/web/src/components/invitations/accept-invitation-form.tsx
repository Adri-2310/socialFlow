'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

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
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={copyPortal}
            className="shrink-0 text-primary hover:text-primary"
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? 'Copié' : 'Copier'}
          </Button>
        </div>
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => {
            router.push('/dashboard');
            router.refresh();
          }}
        >
          Accéder à mon espace
        </Button>
      </div>
    );
  }

  // Une seule erreur pour tout le formulaire (règles locales, serveur) : elle est reliée aux deux
  // champs mot de passe, les seuls que les règles locales mettent en cause.
  const errorProps = error
    ? ({ 'aria-invalid': true, 'aria-describedby': 'invite-error' } as const)
    : {};

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <FormField id="invite-email" label="Email">
        {(control) => <Input {...control} type="email" value={email} disabled />}
      </FormField>

      <FormField id="invite-name" label="Nom complet" required>
        {(control) => (
          <Input
            {...control}
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jean Dupont"
          />
        )}
      </FormField>

      <FormField id="invite-password" label="Mot de passe" required>
        {(control) => (
          <div className="relative">
            <Input
              {...control}
              {...errorProps}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
              placeholder="8 caractères minimum"
            />
            {/* Un seul bouton pour les deux champs, comme reset-password-form.tsx. */}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        )}
      </FormField>

      <FormField id="invite-confirm-password" label="Confirmer le mot de passe" required>
        {(control) => (
          <Input
            {...control}
            {...errorProps}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
          />
        )}
      </FormField>

      {error && (
        <p id="invite-error" role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} size="lg" className="w-full">
        {loading && <Spinner />}
        Créer mon compte
      </Button>
    </form>
  );
}
