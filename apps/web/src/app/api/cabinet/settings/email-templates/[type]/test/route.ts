import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-guard';
import { getCabinetEmailBrand } from '@/lib/cabinet-email-brand';
import { sendGestionnaireInvitationEmail } from '@/lib/email';
import { TEMPLATES, isTemplateType, validateTemplate } from '@/lib/email-templates';

// Envoi d'un email de test du modele (brouillon, non enregistre) (D68). Il part
// UNIQUEMENT vers l'adresse du titulaire connecte, jamais vers une adresse
// fournie par la requete : la route ne peut pas servir a envoyer des emails a
// des tiers. Les valeurs sont fictives.
export async function POST(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const guard = await requireApiSession(request, {
    role: 'CABINET_RH',
    cabinet: true,
    writable: true,
  });
  if (guard.response) return guard.response;
  const { cabinetId, email: ownEmail } = guard.session.user as {
    cabinetId: string;
    id: string;
    email: string;
  };

  const { type } = await params;
  if (!isTemplateType(type)) {
    return NextResponse.json({ error: 'TEMPLATE_NOT_FOUND' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.subject !== 'string' || typeof body?.body !== 'string') {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }
  const validation = validateTemplate(type, { subject: body.subject, body: body.body });
  if (!validation.ok) {
    return NextResponse.json({ error: 'INVALID_TEMPLATE', fields: validation.errors }, { status: 400 });
  }

  const sample = TEMPLATES[type].sample;
  // Le bouton du test mene a la vraie page d'acceptation de l'application, avec
  // un jeton qui n'existe pas ("invitation invalide") : jamais a un site tiers.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const link = appUrl ? `${appUrl}/invitations/accept?token=exemple` : sample.lien;
  try {
    const brand = await getCabinetEmailBrand(cabinetId);
    await sendGestionnaireInvitationEmail(
      ownEmail,
      brand,
      sample.invitant_nom,
      link,
      validation.value,
      { subjectPrefix: '[Test] ' },
    );
  } catch (error) {
    console.error("Echec de l'envoi de l'email de test", error);
    return NextResponse.json({ error: 'EMAIL_SEND_FAILED' }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
