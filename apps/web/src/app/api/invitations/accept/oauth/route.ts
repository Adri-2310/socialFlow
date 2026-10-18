import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ACCEPT_ERROR_STATUS, acceptInvitationWithOAuth } from '@/lib/invitation-accept';

// Acceptation d'une invitation par une personne qui vient de se connecter avec
// Google ou Microsoft (C4). La session est celle du compte OAuth tout neuf : son
// email verifie par le fournisseur doit etre celui de l'invitation, et le compte
// ne doit etre rattache a aucun cabinet. Le role, le cabinet et l'entreprise
// viennent de l'invitation, jamais du client. Voir lib/invitation-accept.ts.
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';

  const { user } = session;
  const result = await acceptInvitationWithOAuth({
    token,
    user: {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      cabinetId: (user.cabinetId as string | null | undefined) ?? null,
      role: (user.role as string | null | undefined) ?? null,
    },
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: ACCEPT_ERROR_STATUS[result.error] });
  }

  return NextResponse.json({ success: true, cabinetName: result.cabinetName });
}
