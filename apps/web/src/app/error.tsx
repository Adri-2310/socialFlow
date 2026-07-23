'use client';

import { useEffect } from 'react';
import { Home, RefreshCw, TriangleAlert } from 'lucide-react';
import { ErrorState } from '@/components/errors/error-state';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      icon={<TriangleAlert className="h-8 w-8" />}
      eyebrow="Erreur inattendue"
      title="Une erreur est survenue"
      description="Quelque chose s'est mal passé de notre côté. Réessayez, ou revenez à l'accueil si le problème persiste."
      digest={error.digest}
      tone="destructive"
      actions={[
        { label: 'Réessayer', onClick: reset, icon: <RefreshCw className="h-4 w-4" /> },
        { label: "Retour à l'accueil", href: '/', icon: <Home className="h-4 w-4" /> },
      ]}
    />
  );
}
