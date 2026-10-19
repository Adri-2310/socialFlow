import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export const TWO_FACTOR_REQUIRED_URL = '/profil?2fa=requise';

// Garde-fou centralise pour les Server Components proteges : sans lui, rien
// n'empeche techniquement qu'une future page authentifiee soit ajoutee sans
// verifier la session (aujourd'hui, seule dashboard/page.tsx le faisait, a
// la main - voir doc/analysis/AUDIT_SECURITE_AUTH.md).
//
// Le check de role est volontairement minimal (une comparaison directe, pas
// une matrice de permissions) : une seule action RBAC existe pour l'instant
// (inviter un Gestionnaire RH, reservee aux Cabinet RH). A etoffer si/quand
// d'autres roles/actions arrivent plutot que d'anticiper une matrice
// complete sans usage reel pour la valider.
//
// `twoFactor: true` exige une 2FA activee (D20, obligatoire pour le SuperAdmin) :
// sinon redirection vers /profil, qui reste accessible sans 2FA pour pouvoir
// l'activer, avec un parametre qui affiche le message d'explication.
export async function requireSession(options?: {
  redirectTo?: string;
  role?: string | string[];
  twoFactor?: boolean;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect(options?.redirectTo ?? '/login');
  }

  if (options?.role) {
    const allowed = Array.isArray(options.role) ? options.role : [options.role];
    if (!allowed.includes(session.user.role ?? '')) {
      redirect('/dashboard');
    }
  }

  if (options?.twoFactor && !session.user.twoFactorEnabled) {
    redirect(TWO_FACTOR_REQUIRED_URL);
  }

  return session;
}
