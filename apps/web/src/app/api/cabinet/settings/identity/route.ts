import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-guard';
import { identitySchema, updateCabinetIdentity } from '@/lib/cabinet-identity';

// Identite du cabinet (D30) : raison sociale, TVA, adresse, contact. Reserve
// au Cabinet RH, pour son cabinet (cabinetId de la session). Ecriture : refusee
// en lecture seule (423, D29).
export async function PATCH(request: Request) {
  const guard = await requireApiSession(request, {
    role: 'CABINET_RH',
    cabinet: true,
    writable: true,
  });
  if (guard.response) return guard.response;
  const { cabinetId, id: actorId } = guard.session.user as { cabinetId: string; id: string };

  const parsed = identitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // Un code par champ, pour que le formulaire affiche l'erreur au bon endroit.
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      if (!(field in fields)) fields[field] = issue.message;
    }
    return NextResponse.json({ error: 'INVALID_REQUEST', fields }, { status: 400 });
  }

  const result = await updateCabinetIdentity(cabinetId, actorId, {
    ...parsed.data,
    vatNumber: parsed.data.vatNumber ?? null,
    addressLine: parsed.data.addressLine ?? null,
    postalCode: parsed.data.postalCode ?? null,
    city: parsed.data.city ?? null,
    contactEmail: parsed.data.contactEmail ?? null,
    contactPhone: parsed.data.contactPhone ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ success: true, identity: result.identity, changed: result.changed });
}
