import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ACCEPT_ERROR_STATUS, acceptInvitationWithPassword } from '@/lib/invitation-accept';

// Cree le compte de la personne invitee (C6) : role, cabinet et rattachement
// viennent de l'invitation, jamais du client. Voir lib/invitation-accept.ts.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const name = typeof body?.name === 'string' ? body.name : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  const result = await acceptInvitationWithPassword({ token, name, password });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: ACCEPT_ERROR_STATUS[result.error] });
  }

  // Ouvre la session : connexion normale avec les identifiants qui viennent
  // d'etre poses (memes controles que toute connexion), dont le Set-Cookie est
  // transfere a la reponse.
  const signIn = await auth.api.signInEmail({
    body: { email: result.email, password },
    headers: request.headers,
    asResponse: true,
  });
  if (signIn.status !== 200) {
    // Le compte existe et l'invitation est consommee : la personne se connecte
    // normalement ; on ne fait pas echouer l'acceptation pour autant.
    return NextResponse.json({ success: true, cabinetName: result.cabinetName, signedIn: false });
  }

  const response = NextResponse.json({ success: true, cabinetName: result.cabinetName, signedIn: true });
  for (const cookie of signIn.headers.getSetCookie()) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
}
