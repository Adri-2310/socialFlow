import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-guard';
import { resetEmailTemplate, saveEmailTemplate } from '@/lib/cabinet-email-templates';
import { isTemplateType, validateTemplate } from '@/lib/email-templates';

// Modele d'email du cabinet (D30, D68) : enregistrement et retour au modele par
// defaut. Reserve au Cabinet RH, pour son cabinet (cabinetId de la session).
// Ecriture : refusee en lecture seule (423, D29). Le type vient de l'URL mais
// n'est accepte que s'il figure dans la liste fermee des modeles.
const guardOptions = { role: 'CABINET_RH', cabinet: true, writable: true } as const;

export async function PUT(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const guard = await requireApiSession(request, guardOptions);
  if (guard.response) return guard.response;
  const { cabinetId, id: actorId } = guard.session.user as { cabinetId: string; id: string };

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

  const result = await saveEmailTemplate(cabinetId, actorId, type, validation.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });

  return NextResponse.json({ success: true, changed: result.changed, template: validation.value });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const guard = await requireApiSession(request, guardOptions);
  if (guard.response) return guard.response;
  const { cabinetId, id: actorId } = guard.session.user as { cabinetId: string; id: string };

  const { type } = await params;
  if (!isTemplateType(type)) {
    return NextResponse.json({ error: 'TEMPLATE_NOT_FOUND' }, { status: 404 });
  }

  const result = await resetEmailTemplate(cabinetId, actorId, type);
  return NextResponse.json({ success: true, changed: result.changed });
}
