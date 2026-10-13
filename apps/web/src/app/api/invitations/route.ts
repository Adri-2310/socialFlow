import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-guard';
import { prisma } from '@/lib/prisma';
import { sendGestionnaireInvitationEmail } from '@/lib/email';
import { createInvitationToken, invitationExpiry, invitationUrl } from '@/lib/invitations';
import { getCabinetQuotaUsage, isQuotaReached, quotaExceededBody } from '@/lib/cabinet-quotas';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Premiere iteration RBAC (voir doc/analysis/ARCHITECTURE_SOCIALFLOW_RBAC.md
// section 4.1) : seul un Cabinet RH peut inviter, et uniquement en tant que
// Gestionnaire RH. La garde (401/403 JSON, pas de redirection HTML) vit dans
// lib/api-guard.ts.
export async function POST(request: Request) {
  const guard = await requireApiSession(request, { role: 'CABINET_RH', cabinet: true });
  if (guard.response) return guard.response;
  const { session } = guard;
  const cabinetId = session.user.cabinetId as string;

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'INVALID_EMAIL' }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json({ error: 'EMAIL_ALREADY_USED' }, { status: 409 });
  }

  const existingInvitation = await prisma.invitation.findFirst({
    where: { email, cabinetId, status: 'pending', expiresAt: { gt: new Date() } },
  });
  if (existingInvitation) {
    return NextResponse.json({ error: 'INVITATION_ALREADY_PENDING' }, { status: 409 });
  }

  // D15, D56 : quota de gestionnaires (gestionnaires + invitations en
  // attente ; le titulaire ne compte pas) bloquant. Controle apres les doublons pour ne pas
  // masquer une erreur plus precise.
  const { limits, utilisateurs } = await getCabinetQuotaUsage(cabinetId);
  if (limits && isQuotaReached(utilisateurs.used, limits.maxUtilisateurs)) {
    return NextResponse.json(
      quotaExceededBody('maxUtilisateurs', limits.maxUtilisateurs as number, utilisateurs.used),
      { status: 403 },
    );
  }

  const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinetId } });

  const { token, tokenHash } = createInvitationToken();
  // Invitation et audit dans la meme transaction (CONVENTIONS.md § 3).
  await prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.create({
      data: {
        email,
        role: 'GESTIONNAIRE_RH',
        tokenHash,
        cabinetId: cabinet.id,
        invitedById: session.user.id,
        expiresAt: invitationExpiry(),
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'INVITATION_SENT',
        actorId: session.user.id,
        cabinetId: cabinet.id,
        metadata: { invitationId: invitation.id, email, role: 'GESTIONNAIRE_RH' },
      },
    });
  });

  const url = invitationUrl(token);
  try {
    await sendGestionnaireInvitationEmail(email, cabinet.name, session.user.name, url);
  } catch (error) {
    // L'invitation existe deja en base a ce stade (token valide 7 jours) :
    // un echec d'envoi (Resend indisponible, etc.) ne doit pas faire
    // apparaitre l'invitation comme ratee cote client, sous peine de la
    // rendre inaccessible (une nouvelle tentative buterait sur
    // INVITATION_ALREADY_PENDING). Meme logique que l'email de verification
    // a l'inscription, qui echoue en tache de fond sans faire echouer le
    // sign-up (voir hooks.after '/sign-up/email' dans auth.ts).
    console.error("Echec de l'envoi de l'email d'invitation", error);
  }

  return NextResponse.json({ success: true });
}
