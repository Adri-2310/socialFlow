'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Undo2 } from 'lucide-react';
import { quotaAwareMessage } from '@/lib/billing/quota-messages';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Vous n'êtes pas autorisé à effectuer cette action.",
  ENTREPRISE_NOT_FOUND: 'Cette entreprise est introuvable.',
  NOT_ARCHIVED: 'Cette entreprise n’est pas archivée.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
  QUOTA_EXCEEDED:
    "Le quota d'entreprises de votre plan est atteint : archivez-en une ou passez à un plan supérieur.",
};

// Restauration d'une entreprise archivee. Sans confirmation : l'action est
// sans danger, l'entreprise retrouve simplement sa place dans le portefeuille.
export function EntrepriseRestore({
  entrepriseId,
  name,
  readOnly,
}: {
  entrepriseId: string;
  name: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/cabinet/entreprises/${entrepriseId}`, { method: 'PUT' });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        quotaAwareMessage(
          body,
          ERROR_MESSAGES,
          'entreprises',
          'Une erreur est survenue. Veuillez réessayer.',
        ),
      );
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:shrink-0 sm:items-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={restore}
        disabled={loading || readOnly}
        aria-label={`Restaurer ${name}`}
        className="h-10 text-xs sm:h-8"
      >
        {loading ? <Spinner /> : <Undo2 aria-hidden="true" />}
        Restaurer
      </Button>
      {error && (
        <p className="max-w-xs text-left text-xs text-destructive-text sm:text-right">{error}</p>
      )}
    </div>
  );
}
