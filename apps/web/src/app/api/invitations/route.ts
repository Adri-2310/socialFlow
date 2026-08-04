import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendGestionnaireInvitationEmail } from '@/lib/email';

const INVITATION_TTL_DAYS = 7;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Premiere iteration RBAC (voir doc/analysis/ARCHITECTURE_SOCIALFLOW_RBAC.md
// section 4.1) : seul un Cabinet RH peut inviter, et uniquement en tant que
// Gestionnaire RH. requireSession() n'est pas reutilise ici : concu pour les
// Server Components (redirect() de next/navigation), il renverrait une
// redirection HTML sur un appel fetch() JSON plutot qu'un 401/403 propre.
// Lit request.headers directement (pas next/headers()) : ce Route Handler
// doit rester appelable/testable comme une fonction pure, sans dependre du
// contexte de requete implicite de Next.js.
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (session.user.role !== 'CABINET_RH' || !session.user.cabinetId) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

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
    where: { email, cabinetId: session.user.cabinetId, status: 'pending', expiresAt: { gt: new Date() } },
  });
  if (existingInvitation) {
    return NextResponse.json({ error: 'INVITATION_ALREADY_PENDING' }, { status: 409 });
  }

  const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: session.user.cabinetId } });

  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.invitation.create({
    data: {
      email,
      role: 'GESTIONNAIRE_RH',
      token,
      cabinetId: cabinet.id,
      invitedById: session.user.id,
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const url = `${process.env.NEXT_PUBLIC_APP_URL}/invitations/accept?token=${token}`;
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
