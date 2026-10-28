'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy } from 'lucide-react';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { SLUG_MAX, SLUG_MIN, slugify } from '@/lib/portal/portal-slug';
import { Notice } from '@/components/shared/notice';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: 'Seul le titulaire du cabinet peut modifier le portail.',
  INVALID_SLUG: `L’identifiant doit faire ${SLUG_MIN} à ${SLUG_MAX} caractères : lettres minuscules, chiffres et tirets.`,
  SLUG_TAKEN: 'Cet identifiant est déjà utilisé par un autre cabinet.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
};

// Portail de connexion des clients du cabinet (D76) : son adresse, a donner a vos
// gestionnaires, entreprises et collaborateurs, et l'identifiant modifiable. Le
// serveur revalide tout.
export function PortalForm({
  slug,
  baseUrl,
  readOnly,
}: {
  slug: string;
  // Adresse de l'application, sans chemin (ex. https://socialflow.page).
  baseUrl: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(slug);
  const [saved, setSaved] = useState(slug);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = `${baseUrl}/connexion/${saved}`;
  const changed = slugify(value) !== saved;

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setLoading(true);
    try {
      const res = await fetch('/api/cabinet/settings/portal', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: value }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(ERROR_MESSAGES[body?.error] ?? 'Une erreur est survenue. Veuillez réessayer.');
        return;
      }
      setSaved(body.slug);
      setValue(body.slug);
      setDone(true);
      router.refresh();
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Copie indisponible (contexte non securise) : l'adresse reste affichee.
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h3 className="text-sm font-bold text-foreground">Portail de connexion de vos clients</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Vos gestionnaires, entreprises clientes et collaborateurs se connectent par cette page, à
        vos couleurs : ils n’y voient pas SocialFlow. Le lien figure dans leur email d’invitation.
      </p>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
        <code
          className="min-w-0 flex-1 truncate text-sm text-foreground"
          aria-label="Adresse du portail"
        >
          {url}
        </code>
        <Button type="button" variant="ghost" size="sm" onClick={copy} className="shrink-0 text-xs">
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copié' : 'Copier'}
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <FormField
          id="portal-slug"
          label="Identifiant du portail"
          hint="Changer l’identifiant fait cesser de fonctionner les liens déjà envoyés : renvoyez-les à vos équipes et clients."
        >
          {(c) => (
            <Input
              {...c}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setDone(false);
                setError(null);
              }}
              disabled={readOnly || loading}
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
        </FormField>

        {error && (
          <p role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        )}
        {done && <Notice tone="success">Identifiant enregistré.</Notice>}
        {readOnly ? (
          <p className="text-xs text-muted-foreground">
            Votre cabinet est en lecture seule : régularisez votre abonnement pour modifier le
            portail.
          </p>
        ) : (
          <Button type="submit" disabled={loading || !changed}>
            {loading && <Spinner />}
            Enregistrer
          </Button>
        )}
      </form>
    </section>
  );
}
