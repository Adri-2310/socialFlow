import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { prisma } from '@/lib/prisma';
import { getCabinetEmailBrand } from '@/lib/email/cabinet-email-brand';
import { getCustomTemplate } from '@/lib/email/cabinet-email-templates';
import { sendGestionnaireInvitationEmail } from '@/lib/email/email';
import { sendEntrepriseAdminInvitation } from '@/lib/entreprise/entreprise-admin';
import { ensureCabinetSlug, portalUrl } from '@/lib/portal/cabinet-portal';
import { createInvitationToken, invitationExpiry, invitationUrl } from '@/lib/invitations/invitations';

// Renvoie une invitation non acceptee (roles/02-cabinet-rh.md § 4.2) : nouveau
// jeton et nouvelle date d'expiration ; l'ancien lien cesse de fonctionner
// puisque seul le hash du jeton courant est conserve (C3).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Revocation/renvoi communs a tous les types d'invitation (gestionnaire, admin
  // d'entreprise) : meme regle aujourd'hui (Cabinet RH seul). Si les lignes
  // gestionnaire.inviter et entreprise.inviter-admin divergent, choisir selon le type.
  const authz = await authorize(request, 'gestionnaire.inviter');
  if (authz.response) return authz.response;
  const { session } = authz;
  const cabinetId = session.user.cabinetId as string;
  const { id } = await params;

  // D26 : l'invitation d'un salarie (COLLABORATEUR) se gere depuis son dossier, par le
  // gestionnaire assigne ; le Cabinet RH ne la voit pas, meme avec son identifiant : 404.
  const invitation = await prisma.invitation.findFirst({
    where: { id, cabinetId, role: { not: 'COLLABORATEUR' } },
    select: {
      id: true,
      email: true,
      status: true,
      entreprise: { select: { id: true, name: true, deletedAt: true, adminUserId: true } },
    },
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

  // Invitation d'administrateur d'entreprise (D5) : l'entreprise doit toujours
  // exister (non archivee) et ne pas avoir deja son administrateur.
  const entreprise = invitation.entreprise;
  if (entreprise) {
    if (entreprise.deletedAt) {
      return NextResponse.json({ error: 'ENTREPRISE_NOT_FOUND' }, { status: 404 });
    }
    if (entreprise.adminUserId) {
      return NextResponse.json({ error: 'ENTREPRISE_ALREADY_HAS_ADMIN' }, { status: 409 });
    }
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
        metadata: {
          invitationId: invitation.id,
          email: invitation.email,
          ...(entreprise ? { entrepriseId: entreprise.id, entreprise: entreprise.name } : {}),
        },
      },
    });
    return true;
  });

  if (!updated) {
    return NextResponse.json({ error: 'INVITATION_ALREADY_ACCEPTED' }, { status: 409 });
  }

  try {
    if (entreprise) {
      await sendEntrepriseAdminInvitation({
        cabinetId,
        inviterName: session.user.name,
        entrepriseName: entreprise.name,
        email: invitation.email,
        token,
      });
    } else {
      const brand = await getCabinetEmailBrand(cabinetId);
      const template = await getCustomTemplate(cabinetId, 'INVITATION_GESTIONNAIRE');
      await sendGestionnaireInvitationEmail(
        invitation.email,
        brand,
        session.user.name,
        invitationUrl(token),
        template,
        { portalUrl: portalUrl(await ensureCabinetSlug(cabinetId)) },
      );
    }
  } catch (error) {
    // Contrairement a la creation, l'envoi est ici le seul but de l'appel :
    // on le signale (502) pour que le cabinet puisse reessayer. Un nouveau
    // renvoi regenere un jeton, donc rien n'est bloque.
    console.error("Echec du renvoi de l'email d'invitation", error);
    return NextResponse.json({ error: 'EMAIL_SEND_FAILED' }, { status: 502 });
  }

  return NextResponse.json({ success: true, expiresAt: expiresAt.toISOString() });
}
