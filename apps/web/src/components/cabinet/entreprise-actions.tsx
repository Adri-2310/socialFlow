'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Pencil } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  EntrepriseFormDialog,
  type EntrepriseFormValues,
  type GestionnaireOption,
} from '@/components/cabinet/entreprise-form-dialog';
import type { CountryOption } from '@/lib/countries';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Vous n'êtes pas autorisé à effectuer cette action.",
  ENTREPRISE_NOT_FOUND: 'Cette entreprise est introuvable.',
  ALREADY_ARCHIVED: 'Cette entreprise est déjà archivée.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
};

// Actions sur une entreprise cliente : modifier (coordonnees et assignations)
// et archiver (soft-delete, passe par une confirmation).
export function EntrepriseActions({
  entrepriseId,
  name,
  initial,
  countries,
  gestionnaires,
  readOnly,
}: {
  entrepriseId: string;
  name: string;
  initial: EntrepriseFormValues;
  countries: CountryOption[];
  gestionnaires: GestionnaireOption[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/cabinet/entreprises/${entrepriseId}`, { method: 'DELETE' });
    setLoading(false);
    setConfirming(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(ERROR_MESSAGES[body?.error] ?? 'Une erreur est survenue. Veuillez réessayer.');
      return;
    }
    router.refresh();
  }

  const buttonClass =
    'flex items-center gap-1.5 rounded-lg border border-input min-h-10 px-3 py-2 sm:min-h-0 sm:px-2.5 sm:py-1.5 text-xs font-semibold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="flex flex-col items-start gap-1 sm:shrink-0 sm:items-end">
      <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={readOnly || loading}
          aria-label={`Modifier ${name}`}
          className={`${buttonClass} text-foreground`}
        >
          <Pencil className="h-3.5 w-3.5" />
          Modifier
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={readOnly || loading}
          aria-label={`Archiver ${name}`}
          className={`${buttonClass} text-destructive-text hover:bg-destructive/10`}
        >
          <Archive className="h-3.5 w-3.5" />
          Archiver
        </button>
      </div>
      {error && <p className="max-w-xs text-left text-xs text-destructive-text sm:text-right">{error}</p>}

      {editing && (
        <EntrepriseFormDialog
          entrepriseId={entrepriseId}
          initial={initial}
          countries={countries}
          gestionnaires={gestionnaires}
          onClose={() => setEditing(false)}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={`Archiver ${name} ?`}
          description="L’entreprise sort de votre portefeuille et libère une place de votre quota. Ses données et ses fiches sont conservées, et vous pourrez la restaurer à tout moment."
          confirmLabel="Archiver"
          loading={loading}
          onCancel={() => setConfirming(false)}
          onConfirm={archive}
        />
      )}
    </div>
  );
}
