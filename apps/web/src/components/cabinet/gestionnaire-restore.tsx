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
  GESTIONNAIRE_NOT_FOUND: 'Ce gestionnaire est introuvable.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : régularisez votre abonnement pour reprendre les modifications.',
  QUOTA_EXCEEDED:
    'Le quota de gestionnaires de votre plan est atteint : libérez une place ou passez à un plan supérieur.',
  RESTORE_NOT_ALLOWED: 'Ce compte ne peut pas être restauré par le cabinet.',
  RESTORE_WINDOW_EXPIRED:
    'Le délai de restauration est dépassé. Contactez le support pour récupérer ce compte.',
};

// Restauration d'un gestionnaire retire, dans le delai prevu par D52. Pas de
// confirmation : l'action est sans danger (le gestionnaire est prevenu et
// retrouve simplement son acces).
export function GestionnaireRestore({
  gestionnaireId,
  name,
}: {
  gestionnaireId: string;
  name: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setError(null);
    setLoading(true);

    const res = await fetch(`/api/gestionnaires/${gestionnaireId}`, { method: 'PUT' });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        quotaAwareMessage(
          body,
          ERROR_MESSAGES,
          'gestionnaires',
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
        disabled={loading}
        aria-label={`Restaurer ${name}`}
        className="h-10 text-xs sm:h-8"
      >
        {loading ? <Spinner /> : <Undo2 aria-hidden="true" />}
        Restaurer
      </Button>
      {error && (
        <p className="max-w-xs text-left sm:text-right text-xs text-destructive-text">{error}</p>
      )}
    </div>
  );
}
