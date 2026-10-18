import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-guard';
import { updateCabinetSlug } from '@/lib/cabinet-portal';

// Identifiant du portail de connexion du cabinet (D76), reserve au Cabinet RH
// pour son cabinet (cabinetId de la session). Ecriture : refusee en lecture seule
// (423, D29).
export async function PATCH(request: Request) {
  const guard = await requireApiSession(request, {
    role: 'CABINET_RH',
    cabinet: true,
    writable: true,
  });
  if (guard.response) return guard.response;
  const { cabinetId, id: actorId } = guard.session.user as { cabinetId: string; id: string };

  const body = await request.json().catch(() => null);
  if (typeof body?.slug !== 'string') {
    return NextResponse.json({ error: 'INVALID_SLUG' }, { status: 400 });
  }

  const result = await updateCabinetSlug(cabinetId, actorId, body.slug);
  if (!result.ok) {
    const status = result.error === 'INVALID_SLUG' ? 400 : result.error === 'SLUG_TAKEN' ? 409 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true, slug: result.slug, changed: result.changed });
}
