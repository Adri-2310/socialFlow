import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { brandingSchema, validateBranding } from '@/lib/branding-rules';
import { updateCabinetBranding } from '@/lib/cabinet-branding';

// Branding du cabinet (D33, D62) : nom affiche et couleurs. Reserve au Cabinet
// RH, pour son cabinet (cabinetId de la session). Ecriture : refusee en
// lecture seule (423, D29). Les couleurs sont validees cote serveur (format
// et contraste) : le formulaire n'est qu'une aide.
export async function PATCH(request: Request) {
  const authz = await authorize(request, 'cabinet.personnaliser');
  if (authz.response) return authz.response;
  const { cabinetId, id: actorId } = authz.session.user as { cabinetId: string; id: string };

  const parsed = brandingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const validation = validateBranding(parsed.data);
  if (!validation.ok) {
    return NextResponse.json({ error: 'INVALID_REQUEST', fields: validation.errors }, { status: 400 });
  }

  const result = await updateCabinetBranding(cabinetId, actorId, validation.value);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ success: true, branding: result.branding, changed: result.changed });
}
