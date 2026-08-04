import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

// Garde-fou centralise pour les Server Components proteges : sans lui, rien
// n'empeche techniquement qu'une future page authentifiee soit ajoutee sans
// verifier la session (aujourd'hui, seule dashboard/page.tsx le faisait, a
// la main - voir doc/analysis/AUDIT_SECURITE_AUTH.md).
export async function requireSession(redirectTo = '/login') {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect(redirectTo);
  }

  return session;
}
