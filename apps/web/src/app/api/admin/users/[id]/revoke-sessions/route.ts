import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-guard';
import { prisma } from '@/lib/prisma';

// D21 : outil de support. Deconnecte le compte partout (appareil perdu, doute
// sur un acces) sans le suspendre : l'utilisateur peut se reconnecter ensuite.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiSession(request, { role: 'SUPER_ADMIN', twoFactor: true });
  if (guard.response) return guard.response;
  const { session } = guard;

  const { id: userId } = await params;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
  }
  // Meme garde-fou que la suspension et l'archivage : un SuperAdmin n'est pas
  // deconnecte par un autre SuperAdmin.
  if (target.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'CANNOT_REVOKE_SUPER_ADMIN' }, { status: 400 });
  }
  if (target.deletedAt) {
    return NextResponse.json({ error: 'USER_ARCHIVED' }, { status: 400 });
  }

  // Audit dans la meme transaction que la revocation.
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.auditLog.create({
      data: { action: 'USER_SESSIONS_REVOKED', actorId: session.user.id, targetUserId: userId },
    }),
  ]);

  return NextResponse.json({ success: true });
}
