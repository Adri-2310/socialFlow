import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hashInvitationToken } from '@/lib/invitations';
import { isReadOnlyBillingStatus } from '@/lib/billing';

// Leve dans la transaction quand l'entreprise a trouve son administrateur entre
// la verification et l'ecriture (D5).
class EntrepriseAdminTaken extends Error {}

// Cree le compte avec le role/cabinetId imposes par l'invitation, plutot que
// de laisser le client les fournir (meme logique que additionalFields.role
// input:false dans auth.ts). Reutilise auth.api.signUpEmail pour beneficier
// de toute la validation deja en place (force du mot de passe, etc.) au lieu
// de reimplementer la creation de compte a la main.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const name = typeof body?.name === 'string' ? body.name : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!token || !name || !password) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
  });
  if (!invitation || invitation.status !== 'pending' || invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 404 });
  }

  const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: invitation.cabinetId } });

  // D5 : une invitation d'administrateur n'est valable que si l'entreprise
  // existe encore (non archivee) et n'a pas deja son administrateur. Sinon le
  // lien est traite comme invalide, sans rien reveler de plus.
  let entrepriseName: string | null = null;
  if (invitation.entrepriseId) {
    const entreprise = await prisma.entreprise.findFirst({
      where: { id: invitation.entrepriseId, cabinetId: invitation.cabinetId, deletedAt: null },
      select: { name: true, adminUserId: true },
    });
    if (!entreprise || entreprise.adminUserId) {
      return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 404 });
    }
    entrepriseName = entreprise.name;
  }

  // D29 : un cabinet en lecture seule ne peut pas accueillir de nouveau compte.
  if (isReadOnlyBillingStatus(cabinet.billingStatus)) {
    return NextResponse.json({ error: 'CABINET_READ_ONLY' }, { status: 423 });
  }

  // Le hook global de auth.ts (sign-up) cree systematiquement un Cabinet pour
  // toute inscription reussie - y compris celle-ci, qui passe par le meme
  // endpoint /sign-up/email. On recupere le cabinetId "fantome" qu'il vient
  // de poser pour le nettoyer juste apres, une fois le role/cabinetId reels
  // de l'invitation appliques.
  const signUpRes = await auth.api.signUpEmail({
    body: { name, email: invitation.email, password },
    asResponse: true,
  });

  if (signUpRes.status !== 200) {
    const errorBody = await signUpRes.json().catch(() => ({ error: 'SIGNUP_FAILED' }));
    return NextResponse.json(errorBody, { status: signUpRes.status });
  }

  const { user } = await signUpRes.json();
  // Le cabinetId dans ce corps de reponse est celui d'avant l'execution du
  // hook after de auth.ts (result.response est construit par l'endpoint
  // avant que les after-hooks ne tournent et ne patchent la base) : on relit
  // donc la valeur reelle en base plutot que de faire confiance au JSON.
  const freshUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { cabinetId: true },
  });
  const phantomCabinetId: string | null = freshUser.cabinetId;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { role: invitation.role, cabinetId: invitation.cabinetId, emailVerified: true },
      });
      // D5 : le compte devient l'administrateur de l'entreprise, seulement si
      // elle n'en a pas deja un (course avec une autre acceptation).
      if (invitation.entrepriseId) {
        const { count } = await tx.entreprise.updateMany({
          where: { id: invitation.entrepriseId, adminUserId: null, deletedAt: null },
          data: { adminUserId: user.id },
        });
        if (count === 0) throw new EntrepriseAdminTaken();
      }
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', acceptedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          action: 'INVITATION_ACCEPTED',
          actorId: user.id,
          cabinetId: invitation.cabinetId,
          metadata: {
            invitationId: invitation.id,
            email: invitation.email,
            ...(invitation.entrepriseId
              ? { entrepriseId: invitation.entrepriseId, entreprise: entrepriseName }
              : {}),
          },
        },
      });
      if (phantomCabinetId && phantomCabinetId !== invitation.cabinetId) {
        await tx.cabinet.delete({ where: { id: phantomCabinetId } });
      }
    });
  } catch (error) {
    if (!(error instanceof EntrepriseAdminTaken)) throw error;
    // Le compte vient d'etre cree par signUpEmail : on le retire pour ne pas
    // laisser un compte sans rattachement, ainsi que son cabinet "fantome".
    await prisma.user.delete({ where: { id: user.id } });
    if (phantomCabinetId && phantomCabinetId !== invitation.cabinetId) {
      await prisma.cabinet.delete({ where: { id: phantomCabinetId } }).catch(() => undefined);
    }
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 404 });
  }

  // Transfere le Set-Cookie de la session ouverte par signUpEmail vers la
  // reponse de cette route (meme mecanique que cookieJar() dans les tests,
  // mais sur de vrais Response/Headers).
  const response = NextResponse.json({ success: true, cabinetName: cabinet.name });
  for (const cookie of signUpRes.headers.getSetCookie()) {
    response.headers.append('set-cookie', cookie);
  }

  return response;
}
