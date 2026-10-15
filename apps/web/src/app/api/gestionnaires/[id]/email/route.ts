import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requireApiSession } from '@/lib/api-guard';
import { prisma } from '@/lib/prisma';
import { sendGestionnaireAccessChangedEmail } from '@/lib/email';

// D53 : le Cabinet RH corrige l'adresse de connexion d'un de ses
// gestionnaires (changement d'adresse professionnelle...). L'adresse est un
// identifiant d'authentification : elle repasse donc a "non verifiee", les
// sessions en cours sont coupees, un email de confirmation part vers la
// nouvelle adresse et l'ancienne est prevenue.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiSession(request, { role: 'CABINET_RH', cabinet: true, writable: true });
  if (guard.response) return guard.response;
  const { session } = guard;
  const cabinetId = session.user.cabinetId as string;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const newEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!z.email().max(254).safeParse(newEmail).success) {
    return NextResponse.json({ error: 'INVALID_EMAIL' }, { status: 400 });
  }

  // Perimetre pose dans la requete : hors cabinet, autre role ou archive =
  // introuvable (404).
  const target = await prisma.user.findFirst({
    where: { id, cabinetId, role: 'GESTIONNAIRE_RH', deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: 'GESTIONNAIRE_NOT_FOUND' }, { status: 404 });
  }
  if (target.email === newEmail) {
    return NextResponse.json({ error: 'EMAIL_UNCHANGED' }, { status: 400 });
  }

  // D7 : un email = un seul rattachement, y compris face a une invitation
  // encore valable (quel que soit le cabinet).
  const [existingUser, pendingInvitation] = await Promise.all([
    prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } }),
    prisma.invitation.findFirst({
      where: { email: newEmail, status: 'pending', expiresAt: { gt: new Date() } },
      select: { id: true },
    }),
  ]);
  if (existingUser) {
    return NextResponse.json({ error: 'EMAIL_ALREADY_USED' }, { status: 409 });
  }
  if (pendingInvitation) {
    return NextResponse.json({ error: 'INVITATION_ALREADY_PENDING' }, { status: 409 });
  }

  const previousEmail = target.email;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { email: newEmail, emailVerified: false },
      });
      // L'identite de connexion change : on coupe les sessions ouvertes.
      await tx.session.deleteMany({ where: { userId: target.id } });
      await tx.auditLog.create({
        data: {
          action: 'USER_EMAIL_CHANGED',
          actorId: session.user.id,
          cabinetId,
          targetUserId: target.id,
          metadata: { previousEmail, newEmail },
        },
      });
    });
  } catch (error) {
    // Course avec une autre creation de compte sur la meme adresse
    // (contrainte d'unicite) : meme reponse que la verification ci-dessus.
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'EMAIL_ALREADY_USED' }, { status: 409 });
    }
    throw error;
  }

  // Les emails ne font jamais echouer l'action : l'adresse est deja changee.
  let verificationEmailSent = true;
  try {
    await auth.api.sendVerificationEmail({
      body: { email: newEmail, callbackURL: '/dashboard' },
    });
  } catch (error) {
    verificationEmailSent = false;
    console.error("Echec de l'envoi de l'email de confirmation de la nouvelle adresse", error);
  }

  try {
    const cabinet = await prisma.cabinet.findUniqueOrThrow({
      where: { id: cabinetId },
      select: { name: true },
    });
    await sendGestionnaireAccessChangedEmail(
      previousEmail,
      target.name,
      cabinet.name,
      'email_changed',
    );
  } catch (error) {
    console.error("Echec de la notification a l'ancienne adresse", error);
  }

  return NextResponse.json({ success: true, verificationEmailSent });
}
