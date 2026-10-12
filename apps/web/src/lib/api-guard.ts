import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

type Guard = { session: Session; response?: never } | { session?: never; response: NextResponse };

// Pendant API de requireSession() (voir require-session.ts) pour les Route
// Handlers : renvoie un 401/403 JSON plutot qu'une redirection HTML, que
// fetch() suivrait silencieusement. Lit request.headers directement (pas
// next/headers()) pour que les handlers restent appelables/testables comme
// des fonctions pures.
//
// Usage :
//   const guard = await requireApiSession(request, { role: 'CABINET_RH', cabinet: true });
//   if (guard.response) return guard.response;
//   const { session } = guard;
//
// `cabinet: true` exige en plus un cabinetId (tout role rattache a un
// cabinet, donc tout sauf SuperAdmin) : evite de repeter la verification au
// debut de chaque route cabinet-scopee.
export async function requireApiSession(
  request: Request,
  options?: { role?: string | string[]; cabinet?: boolean },
): Promise<Guard> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return { response: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) };
  }

  if (options?.role) {
    const allowed = Array.isArray(options.role) ? options.role : [options.role];
    if (!allowed.includes(session.user.role ?? '')) {
      return { response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }) };
    }
  }

  if (options?.cabinet && !session.user.cabinetId) {
    return { response: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }) };
  }

  return { session };
}
