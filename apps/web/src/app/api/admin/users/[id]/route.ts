import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const VALID_STATUSES = ['actif', 'suspendu'] as const;
type UserStatus = (typeof VALID_STATUSES)[number];

// Suspension/reactivation d'un utilisateur individuel par un SuperAdmin (voir
// api/admin/cabinets/[id]/route.ts pour le meme mecanisme cote Cabinet, en
// plus large puisqu'il touche tous les utilisateurs du cabinet). Ne bloque
// que ce compte precis, sans affecter les autres membres de son cabinet.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { id: userId } = await params;

  const body = await request.json().catch(() => null);
  const status = body?.status as string | undefined;
  if (!status || !VALID_STATUSES.includes(status as UserStatus)) {
    return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
  }
  if (target.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'CANNOT_SUSPEND_SUPER_ADMIN' }, { status: 400 });
  }
  if (target.deletedAt) {
    return NextResponse.json({ error: 'USER_ARCHIVED' }, { status: 400 });
  }

  if (status === 'suspendu') {
    // Coupe l'acces immediatement (pas seulement a la prochaine connexion) :
    // le blocage dans hooks.after de auth.ts empeche les NOUVELLES sessions,
    // mais ne touche pas celles deja actives.
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.update({ where: { id: userId }, data: { status: 'suspendu' } });
    await prisma.auditLog.create({
      data: { action: 'USER_SUSPENDED', actorId: session.user.id, targetUserId: userId },
    });
  } else {
    await prisma.user.update({ where: { id: userId }, data: { status: 'actif' } });
    await prisma.auditLog.create({
      data: { action: 'USER_REACTIVATED', actorId: session.user.id, targetUserId: userId },
    });
  }

  return NextResponse.json({ success: true });
}

// Archive/restaure un utilisateur par un SuperAdmin (voir
// api/admin/cabinets/[id]/route.ts pour le meme mecanisme cote Cabinet).
// Reutilise User.deletedAt tel quel : le blocage de connexion (hooks.after
// dans auth.ts) ne distingue pas une auto-suppression d'un archivage par un
// admin, et la purge reelle (api/cron/purge-deleted-accounts) s'applique deja
// a toute ligne deletedAt, peu importe qui l'a posee.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { id: userId } = await params;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
  }
  // Un SuperAdmin ne peut jamais etre archive par ce chemin (soi-meme ou un
  // autre) : evite un verrouillage total de la console si le dernier
  // SuperAdmin actif se retrouve archive par erreur.
  if (target.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'CANNOT_ARCHIVE_SUPER_ADMIN' }, { status: 400 });
  }
  if (target.deletedAt) {
    return NextResponse.json({ error: 'USER_ALREADY_ARCHIVED' }, { status: 400 });
  }

  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
  await prisma.auditLog.create({
    data: { action: 'USER_ARCHIVED', actorId: session.user.id, targetUserId: userId },
  });

  return NextResponse.json({ success: true });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { id: userId } = await params;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
  }
  if (!target.deletedAt) {
    return NextResponse.json({ error: 'USER_NOT_ARCHIVED' }, { status: 400 });
  }

  await prisma.user.update({ where: { id: userId }, data: { deletedAt: null } });
  await prisma.auditLog.create({
    data: { action: 'USER_RESTORED', actorId: session.user.id, targetUserId: userId },
  });

  return NextResponse.json({ success: true });
}
