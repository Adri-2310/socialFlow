import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-guard';
import { inviteEntrepriseAdmin, sendEntrepriseAdminInvitation } from '@/lib/entreprise-admin';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Invitation de l'administrateur d'une entreprise cliente (D4, D5) : reservee au
// Cabinet RH. L'entreprise est cherchee avec le cabinet de la session : celle
// d'un autre cabinet est "introuvable" (404). Le renvoi et la revocation passent
// par /api/invitations/[id], communs a tous les types d'invitation.
//
// D78 : `replace: true` invite le REMPLACANT de l'administrateur en place, qui reste
// actif jusqu'a l'acceptation. Le Cabinet RH ET le gestionnaire assigne a l'entreprise
// peuvent le demander ; le gestionnaire ne peut QUE remplacer (jamais inviter un
// premier administrateur) et une entreprise qui ne lui est pas assignee est introuvable.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiSession(request, {
    role: ['CABINET_RH', 'GESTIONNAIRE_RH'],
    cabinet: true,
    writable: true,
  });
  if (guard.response) return guard.response;
  const {
    cabinetId,
    id: actorId,
    name: actorName,
    role,
  } = guard.session.user as { cabinetId: string; id: string; name: string; role: string };
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'INVALID_EMAIL' }, { status: 400 });
  }
  const replace = body?.replace === true;

  const isGestionnaire = role === 'GESTIONNAIRE_RH';
  if (isGestionnaire && !replace) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const result = await inviteEntrepriseAdmin(cabinetId, { id: actorId, name: actorName }, id, email, {
    replace,
    onlyAssignedTo: isGestionnaire ? actorId : undefined,
  });
  if (!result.ok) {
    const status = result.error === 'ENTREPRISE_NOT_FOUND' ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  try {
    await sendEntrepriseAdminInvitation({
      cabinetId,
      inviterName: actorName,
      entrepriseName: result.entrepriseName,
      email,
      token: result.token,
    });
  } catch (error) {
    // L'invitation existe deja (lien valable 7 jours) : un echec d'envoi ne la
    // fait pas echouer, le cabinet peut la renvoyer (meme logique que
    // api/invitations).
    console.error("Echec de l'envoi de l'email d'invitation", error);
  }

  return NextResponse.json({ success: true, invitationId: result.invitationId }, { status: 201 });
}
