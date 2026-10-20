import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { scheduleCancellation } from '@/lib/billing/cabinet-subscription';

// Programme la resiliation de l'abonnement en fin de periode (D59) : le cabinet garde l'acces jusqu'au terme.
// Reserve au Cabinet RH, pour son cabinet (cabinetId de la session).
const STATUS: Record<string, number> = {
  CABINET_NOT_FOUND: 404,
  NO_STRIPE_CUSTOMER: 409,
  NO_SUBSCRIPTION: 409,
  ALREADY_CANCELLING: 409,
  NOT_CANCELLING: 409,
  STRIPE_FAILED: 502,
};

export async function POST(request: Request) {
  const authz = await authorize(request, 'abonnement.gerer');
  if (authz.response) return authz.response;
  const { cabinetId, id: actorId } = authz.session.user as { cabinetId: string; id: string };

  const result = await scheduleCancellation(cabinetId, actorId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 502 });
  }

  return NextResponse.json({ success: true });
}
