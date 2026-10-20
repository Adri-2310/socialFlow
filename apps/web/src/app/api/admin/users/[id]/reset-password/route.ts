import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import { ensureCabinetSlug, isPortalRole, portalPath } from '@/lib/portal/cabinet-portal';

// D21 : outil de support. Envoie au compte le lien de reinitialisation
// standard (meme flux et meme email que « Mot de passe oublie »). Le SuperAdmin
// ne voit et ne fixe jamais de mot de passe.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorize(request, 'utilisateur.support');
  if (authz.response) return authz.response;
  const { session } = authz;

  const { id: userId } = await params;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
  }
  if (target.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'CANNOT_RESET_SUPER_ADMIN' }, { status: 400 });
  }
  if (target.deletedAt) {
    return NextResponse.json({ error: 'USER_ARCHIVED' }, { status: 400 });
  }

  // D76, D77 : les roles de portail reprennent le mot de passe sur le portail
  // de leur cabinet, comme depuis « Mot de passe oublie ».
  const resetPage =
    isPortalRole(target.role) && target.cabinetId
      ? `${portalPath(await ensureCabinetSlug(target.cabinetId))}/reinitialiser-mot-de-passe`
      : '/reinitialiser-mot-de-passe';

  // Better Auth envoie l'email en arriere-plan : une panne d'envoi n'est pas
  // visible ici. La route confirme la demande du lien, pas la livraison.
  await auth.api.requestPasswordReset({ body: { email: target.email, redirectTo: resetPage } });

  // L'email est un service externe : l'audit suit l'appel, hors transaction.
  await prisma.auditLog.create({
    data: { action: 'USER_PASSWORD_RESET_SENT', actorId: session.user.id, targetUserId: userId },
  });

  return NextResponse.json({ success: true });
}
