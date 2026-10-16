'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserMinus } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Vous n'êtes pas autorisé à effectuer cette action.",
  ENTREPRISE_NOT_FOUND: 'Cette entreprise est introuvable ou archivée.',
  ENTREPRISE_HAS_NO_ADMIN: 'Cette entreprise n’a plus d’administrateur.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
};

// Retrait de l'administrateur d'une entreprise (D5) : premiere etape du
// remplacement. Le compte est archive et ses sessions coupees ; on peut ensuite
// inviter le nouvel administrateur.
export function EntrepriseAdminRemove({
  entrepriseId,
  entrepriseName,
  adminName,
  readOnly,
}: {
  entrepriseId: string;
  entrepriseName: string;
  adminName: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/cabinet/entreprises/${entrepriseId}/admin`, { method: 'DELETE' });
    setLoading(false);
    setConfirm(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(ERROR_MESSAGES[body?.error] ?? 'Une erreur est survenue. Veuillez réessayer.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        disabled={readOnly || loading}
        onClick={() => setConfirm(true)}
        aria-label={`Retirer l'administrateur de ${entrepriseName}`}
        className="flex min-h-10 items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-xs font-semibold text-destructive-text transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:px-2.5 sm:py-1.5"
      >
        <UserMinus className="h-3.5 w-3.5" />
        Retirer
      </button>
      {error && <p className="max-w-xs text-xs text-destructive-text sm:text-right">{error}</p>}

      {confirm && (
        <ConfirmDialog
          title="Retirer l’administrateur ?"
          description={`${adminName} perdra immédiatement l’accès à l’espace de ${entrepriseName}. Vous pourrez ensuite inviter un nouvel administrateur. Son adresse email reste réservée quelque temps : utilisez-en une autre pour le remplaçant.`}
          confirmLabel="Retirer"
          loading={loading}
          onCancel={() => setConfirm(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
