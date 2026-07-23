'use client';

import { useEffect } from 'react';
import { OctagonAlert, RefreshCw } from 'lucide-react';

export default function GlobalError({
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
    <html lang="fr">
      <body className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center text-white antialiased">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-teal-500 shadow-lg shadow-indigo-600/30">
          <OctagonAlert className="h-8 w-8" />
        </span>

        <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-red-400">
          Erreur critique
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          SocialFlow a rencontré un problème
        </h1>
        <p className="mt-4 max-w-md text-slate-400">
          Une erreur inattendue empêche l&apos;affichage de l&apos;application. Réessayez dans un
          instant ; si le problème persiste, contactez le support.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-slate-500">Référence : {error.digest}</p>
        )}

        <button
          type="button"
          onClick={reset}
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:opacity-90"
        >
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </button>
      </body>
    </html>
  );
}
