'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { ERROR_MESSAGES, FALLBACK } from '@/lib/salarie/form-messages';

// Durée pendant laquelle le clair reste affiché avant de se remasquer tout seul.
const AFFICHAGE_MS = 30_000;

// Valeur sensible masquée (NISS, IBAN) avec un bouton « Afficher » (roles/03 § 4.1). Chaque
// affichage passe par la route de dévoilement, qui le journalise. Le clair ne vit que dans
// l'état de ce composant : jamais dans la page rendue par le serveur, ni dans le stockage du
// navigateur, et il disparaît au bout de 30 secondes ou en quittant la page.
export function SensitiveValue({
  salarieId,
  field,
  label,
  masked,
}: {
  salarieId: string;
  field: 'niss' | 'iban';
  label: string;
  masked: string;
}) {
  const [clair, setClair] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se remasque seul : un écran laissé ouvert ne doit pas garder un NISS affiché.
  useEffect(() => {
    if (clair === null) return;
    const minuteur = setTimeout(() => setClair(null), AFFICHAGE_MS);
    return () => clearTimeout(minuteur);
  }, [clair]);

  async function reveler() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/salaries/${salarieId}/reveal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ field }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || typeof body?.value !== 'string') {
        setError(ERROR_MESSAGES[body?.error] ?? FALLBACK);
        return;
      }
      setClair(body.value);
    } catch {
      setError(FALLBACK);
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono">{clair ?? masked}</span>
      <button
        type="button"
        onClick={clair === null ? reveler : () => setClair(null)}
        disabled={loading}
        aria-label={clair === null ? `Afficher le ${label}` : `Masquer le ${label}`}
        title={clair === null ? 'Afficher (inscrit à l’audit)' : 'Masquer'}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : clair === null ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <EyeOff className="h-3.5 w-3.5" />
        )}
      </button>
      {error && (
        <span role="alert" className="basis-full text-xs text-destructive-text">
          {error}
        </span>
      )}
    </span>
  );
}
