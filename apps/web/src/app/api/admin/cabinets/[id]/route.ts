import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const VALID_STATUSES = ['actif', 'suspendu'] as const;
type CabinetStatus = (typeof VALID_STATUSES)[number];

// Suspension/reactivation de cabinet par un SuperAdmin (voir
// doc/analysis/ARCHITECTURE_SOCIALFLOW_RBAC.md, SPEC_FINAL.md section
// MONITORING & ADMIN). Meme raison qu'invitations/route.ts pour ne pas
// reutiliser requireSession() ici : ce Route Handler doit renvoyer un
// 401/403 JSON, pas une redirection HTML.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { id: cabinetId } = await params;

  const body = await request.json().catch(() => null);
  const status = body?.status as string | undefined;
  if (!status || !VALID_STATUSES.includes(status as CabinetStatus)) {
    return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
  }

  const cabinet = await prisma.cabinet.findUnique({ where: { id: cabinetId } });
  if (!cabinet) {
    return NextResponse.json({ error: 'CABINET_NOT_FOUND' }, { status: 404 });
  }

  if (status === 'suspendu') {
    // Coupe l'acces immediatement (pas seulement a la prochaine connexion) :
    // le blocage dans hooks.after de auth.ts empeche les NOUVELLES sessions,
    // mais ne touche pas celles deja actives.
    await prisma.session.deleteMany({ where: { user: { cabinetId } } });
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { status: 'suspendu' } });
    await prisma.auditLog.create({
      data: { action: 'CABINET_SUSPENDED', actorId: session.user.id, cabinetId },
    });
  } else {
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { status: 'actif' } });
    await prisma.auditLog.create({
      data: { action: 'CABINET_REACTIVATED', actorId: session.user.id, cabinetId },
    });
  }

  return NextResponse.json({ success: true });
}
