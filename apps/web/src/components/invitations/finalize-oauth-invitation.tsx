'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: "Ce lien d'invitation n'est plus valable.",
  EMAIL_MISMATCH: "L'adresse de ce compte n'est pas celle de l'invitation.",
  ACCOUNT_NOT_ELIGIBLE: 'Ce compte est déjà rattaché à un cabinet.',
  CABINET_READ_ONLY:
    "Ce cabinet ne peut pas accueillir de nouveau compte pour le moment. Contactez la personne qui vous a invité.",
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous avec Google ou Microsoft.',
};

// Rattache au cabinet le compte Google/Microsoft qui vient de se connecter (C4).
// Affiche seulement quand la page serveur a verifie que l'adresse du compte est
// celle de l'invitation ; le serveur revalide tout (e-mail verifie, compte neuf).
export function FinalizeOAuthInvitation({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const res = await fetch('/api/invitations/accept/oauth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(ERROR_MESSAGES[body?.error] ?? 'Une erreur est survenue. Veuillez réessayer.');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    })().catch(() => setError('Une erreur est survenue. Veuillez réessayer.'));
  }, [token, router]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive-text">
        {error}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      Rattachement de {email} à votre espace…
    </div>
  );
}
