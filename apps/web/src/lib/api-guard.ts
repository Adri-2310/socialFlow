import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isReadOnlyBillingStatus } from '@/lib/billing';
import { prisma } from '@/lib/prisma';

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
// `writable: true` marque une route d'ecriture : 423 CABINET_READ_ONLY si le
// cabinet est en lecture seule.
//
// `cabinet: true` exige en plus un cabinetId (tout role rattache a un
// cabinet, donc tout sauf SuperAdmin) : evite de repeter la verification au
// debut de chaque route cabinet-scopee.
export async function requireApiSession(
  request: Request,
  options?: { role?: string | string[]; cabinet?: boolean; writable?: boolean },
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

  // Route d'ecriture : refusee (423) quand le cabinet de l'utilisateur est en
  // lecture seule (impaye, resilie - D29). La lecture de l'etat n'a lieu que
  // pour les routes qui le demandent. Un utilisateur sans cabinet (SuperAdmin)
  // n'est pas concerne.
  if (options?.writable && session.user.cabinetId) {
    const cabinet = await prisma.cabinet.findUnique({
      where: { id: session.user.cabinetId },
      select: { billingStatus: true },
    });
    if (cabinet && isReadOnlyBillingStatus(cabinet.billingStatus)) {
      return { response: NextResponse.json({ error: 'CABINET_READ_ONLY' }, { status: 423 }) };
    }
  }

  return { session };
}
