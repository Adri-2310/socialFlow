import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-guard';
import { prisma } from '@/lib/prisma';

// Revoque une invitation du cabinet (roles/02-cabinet-rh.md § 4.2) : le lien
// envoye par email cesse immediatement de fonctionner (la route d'acceptation
// ne retient que le statut "pending").
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiSession(request, { role: 'CABINET_RH', cabinet: true, writable: true });
  if (guard.response) return guard.response;
  const { session } = guard;
  const cabinetId = session.user.cabinetId as string;
  const { id } = await params;

  // Hors perimetre = inexistante (404), jamais 403 : on ne revele pas qu'une
  // invitation d'un autre cabinet existe.
  const invitation = await prisma.invitation.findFirst({
    where: { id, cabinetId },
    select: { id: true, email: true, status: true },
  });
  if (!invitation) {
    return NextResponse.json({ error: 'INVITATION_NOT_FOUND' }, { status: 404 });
  }
  if (invitation.status === 'accepted') {
    return NextResponse.json({ error: 'INVITATION_ALREADY_ACCEPTED' }, { status: 409 });
  }
  if (invitation.status === 'revoked') {
    return NextResponse.json({ error: 'INVITATION_ALREADY_REVOKED' }, { status: 409 });
  }

  // Le filtre sur le statut dans l'ecriture elle-meme couvre la course avec
  // une acceptation simultanee : si elle a eu lieu entre la lecture et ici,
  // aucune ligne n'est modifiee.
  const revoked = await prisma.$transaction(async (tx) => {
    const { count } = await tx.invitation.updateMany({
      where: { id: invitation.id, cabinetId, status: { in: ['pending', 'expired'] } },
      data: { status: 'revoked' },
    });
    if (count === 0) return false;

    await tx.auditLog.create({
      data: {
        action: 'INVITATION_REVOKED',
        actorId: session.user.id,
        cabinetId,
        metadata: { invitationId: invitation.id, email: invitation.email },
      },
    });
    return true;
  });

  if (!revoked) {
    return NextResponse.json({ error: 'INVITATION_ALREADY_ACCEPTED' }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
