import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/auth';

// Garde-fou minimal des Server Components qui n'exigent qu'une session, sans
// décision d'accès : aujourd'hui l'aiguillage /dashboard, qui envoie chaque rôle
// vers son espace. Toute page qui dépend du rôle passe par requireAuthorized
// (authz-page.ts), qui lit la matrice de PERMISSIONS.md.
export async function requireSession(options?: { redirectTo?: string }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect(options?.redirectTo ?? '/login');
  }

  return session;
}
