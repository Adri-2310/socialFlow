import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { removeCabinetLogo, setCabinetLogo } from '@/lib/cabinet-logo';
import { LOGO_MAX_BYTES } from '@/lib/logo-validation';

// Logo du cabinet (D33, D62). Reserve au Cabinet RH, pour son cabinet
// (cabinetId de la session). Ecriture : refusee en lecture seule (423, D29).
const STATUS: Record<string, number> = {
  LOGO_REQUIRED: 400,
  LOGO_INVALID_TYPE: 415,
  LOGO_TOO_LARGE: 413,
  LOGO_SVG_UNSAFE: 422,
  CABINET_NOT_FOUND: 404,
  LOGO_STORAGE_UNAVAILABLE: 503,
  LOGO_STORAGE_FAILED: 502,
};

export async function POST(request: Request) {
  const authz = await authorize(request, 'cabinet.personnaliser');
  if (authz.response) return authz.response;
  const { cabinetId, id: actorId } = authz.session.user as { cabinetId: string; id: string };

  // Refus avant de lire un corps manifestement trop gros.
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > LOGO_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'LOGO_TOO_LARGE' }, { status: 413 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get('logo');
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json({ error: 'LOGO_REQUIRED' }, { status: 400 });
  }

  const bytes = file ? new Uint8Array(await file.arrayBuffer()) : null;
  const result = await setCabinetLogo(cabinetId, actorId, bytes);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  }

  return NextResponse.json({ success: true, logoUrl: result.logoUrl });
}

export async function DELETE(request: Request) {
  const authz = await authorize(request, 'cabinet.personnaliser');
  if (authz.response) return authz.response;
  const { cabinetId, id: actorId } = authz.session.user as { cabinetId: string; id: string };

  const result = await removeCabinetLogo(cabinetId, actorId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  }

  return NextResponse.json({ success: true });
}
