import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { ACCEPT_ERROR_STATUS, acceptInvitationWithPassword } from '@/lib/invitations/invitation-accept';
import { ensureCabinetSlug, portalUrl } from '@/lib/portal/cabinet-portal';
import { getCabinetEmailBrand } from '@/lib/email/cabinet-email-brand';
import { sendAdminReplacedEmail, sendWelcomeAccountEmail } from '@/lib/email/email';
import { PORTAL_HEADER } from '@/lib/portal/portal-slug';

// Cree le compte de la personne invitee (C6) : role, cabinet et rattachement
// viennent de l'invitation, jamais du client. Voir lib/invitations/invitation-accept.ts.
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
  // transfere a la reponse. D76 : la personne vient de creer son compte pour CE
  // cabinet, la connexion passe donc par le portail de ce cabinet.
  const slug = await ensureCabinetSlug(result.cabinetId);
  const portal = portalUrl(slug);
  const headers = new Headers(request.headers);
  headers.set(PORTAL_HEADER, slug);
  const signIn = await auth.api.signInEmail({
    body: { email: result.email, password },
    headers,
    asResponse: true,
  });
  // D76 : email de bienvenue au nom du cabinet, avec l'adresse de son portail. Jamais
  // bloquant : le compte existe, un echec d'envoi ne doit pas faire echouer l'acceptation.
  try {
    const brand = await getCabinetEmailBrand(result.cabinetId);
    await sendWelcomeAccountEmail(result.email, brand, result.name, portal, result.entrepriseName);
  } catch (error) {
    console.error("Echec de l'envoi de l'email de bienvenue", error);
  }
  // D78 : l'ancien administrateur, desactive par cette acceptation, en est prevenu.
  if (result.replacedAdmin && result.entrepriseName) {
    try {
      const brand = await getCabinetEmailBrand(result.cabinetId);
      await sendAdminReplacedEmail(
        result.replacedAdmin.email,
        brand,
        result.replacedAdmin.name,
        result.entrepriseName,
      );
    } catch (error) {
      console.error("Echec de l'envoi de l'email a l'ancien administrateur", error);
    }
  }

  if (signIn.status !== 200) {
    // Le compte existe et l'invitation est consommee : la personne se connecte
    // normalement ; on ne fait pas echouer l'acceptation pour autant.
    return NextResponse.json({ success: true, cabinetName: result.cabinetName, portalUrl: portal, signedIn: false });
  }

  const response = NextResponse.json({ success: true, cabinetName: result.cabinetName, portalUrl: portal, signedIn: true });
  for (const cookie of signIn.headers.getSetCookie()) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
}
