import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-guard';
import { prisma } from '@/lib/prisma';
import { getCabinetEmailBrand } from '@/lib/cabinet-email-brand';
import { getCustomTemplate } from '@/lib/cabinet-email-templates';
import { sendGestionnaireInvitationEmail } from '@/lib/email';
import { createInvitationToken, invitationExpiry, invitationUrl } from '@/lib/invitations';

// Renvoie une invitation non acceptee (roles/02-cabinet-rh.md § 4.2) : nouveau
// jeton et nouvelle date d'expiration ; l'ancien lien cesse de fonctionner
// puisque seul le hash du jeton courant est conserve (C3).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiSession(request, { role: 'CABINET_RH', cabinet: true, writable: true });
  if (guard.response) return guard.response;
  const { session } = guard;
  const cabinetId = session.user.cabinetId as string;
  const { id } = await params;

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

  // D7 : un email = un seul rattachement. Si un compte a ete cree entre-temps
  // avec cette adresse, l'invitation n'a plus lieu d'etre renvoyee.
  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true },
  });
  if (existingUser) {
    return NextResponse.json({ error: 'EMAIL_ALREADY_USED' }, { status: 409 });
  }

  const { token, tokenHash } = createInvitationToken();
  const expiresAt = invitationExpiry();

  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.invitation.updateMany({
      where: { id: invitation.id, cabinetId, status: { in: ['pending', 'expired'] } },
      data: { tokenHash, expiresAt, status: 'pending' },
    });
    if (count === 0) return false;

    await tx.auditLog.create({
      data: {
        action: 'INVITATION_RESENT',
        actorId: session.user.id,
        cabinetId,
        metadata: { invitationId: invitation.id, email: invitation.email },
      },
    });
    return true;
  });

  if (!updated) {
    return NextResponse.json({ error: 'INVITATION_ALREADY_ACCEPTED' }, { status: 409 });
  }

  try {
    const brand = await getCabinetEmailBrand(cabinetId);
    const template = await getCustomTemplate(cabinetId, 'INVITATION_GESTIONNAIRE');
    await sendGestionnaireInvitationEmail(
      invitation.email,
      brand,
      session.user.name,
      invitationUrl(token),
      template,
    );
  } catch (error) {
    // Contrairement a la creation, l'envoi est ici le seul but de l'appel :
    // on le signale (502) pour que le cabinet puisse reessayer. Un nouveau
    // renvoi regenere un jeton, donc rien n'est bloque.
    console.error("Echec du renvoi de l'email d'invitation", error);
    return NextResponse.json({ error: 'EMAIL_SEND_FAILED' }, { status: 502 });
  }

  return NextResponse.json({ success: true, expiresAt: expiresAt.toISOString() });
}
