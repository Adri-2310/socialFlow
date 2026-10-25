import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/auth';
import { ACTIONS, levelFor, type ActionId } from '@/lib/authz/authz';

// D20 : /profil reste accessible sans 2FA pour pouvoir l'activer ; ce paramètre y
// affiche le message d'explication.
export const TWO_FACTOR_REQUIRED_URL = '/profil?2fa=requise';

// Pendant « page » de authorize() (voir authz.ts) pour les Server Components :
// même catalogue d'actions et mêmes règles, mais avec des redirections HTML au
// lieu de réponses JSON (que fetch suivrait silencieusement).
//   pas de session                  -> /login
//   rôle refusé par la matrice      -> /dashboard
//   SuperAdmin sans 2FA (D20)       -> /profil?2fa=requise, sauf pour les actions
//                                      exemptées (le profil, pour activer la 2FA)
//
// Comme requireSession avant elle, elle ne contrôle pas la présence d'un cabinet :
// chaque page garde sa propre gestion (voir requirePaidCabinet).
//
// Usage :
//   const { user } = await requireAuthorized('audit.voir');
export async function requireAuthorized(action: ActionId) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect('/login');
  }

  if (levelFor(action, session.user.role) === 'DENY') {
    redirect('/dashboard');
  }

  if (
    session.user.role === 'SUPER_ADMIN' &&
    !ACTIONS[action].twoFactorExempt &&
    !session.user.twoFactorEnabled
  ) {
    redirect(TWO_FACTOR_REQUIRED_URL);
  }

  return session;
}
