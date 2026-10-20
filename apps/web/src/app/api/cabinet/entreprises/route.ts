import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { createEntreprise, entrepriseSchema } from '@/lib/entreprise/cabinet-entreprises';
import { entrepriseErrorResponse, invalidRequestResponse } from '@/lib/entreprise/entreprise-http';

// Creation d'une entreprise cliente (D4) : reservee au Cabinet RH, pour son
// cabinet (cabinetId de la session). Refusee en lecture seule (423, D29) et
// au-dela de maxEntreprises (403 QUOTA_EXCEEDED, D15).
export async function POST(request: Request) {
  const authz = await authorize(request, 'entreprise.gerer');
  if (authz.response) return authz.response;
  const { cabinetId, id: actorId } = authz.session.user as { cabinetId: string; id: string };

  const parsed = entrepriseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequestResponse(parsed.error);

  const result = await createEntreprise(cabinetId, actorId, parsed.data);
  if (!result.ok) return entrepriseErrorResponse(result);

  return NextResponse.json({ success: true, id: result.id }, { status: 201 });
}
