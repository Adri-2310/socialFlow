import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { cancelPlanChange } from '@/lib/plan-change';

// Annule le changement de plan programme (D60) : l'abonnement continue tel
// quel. Reserve au Cabinet RH, pour son cabinet.
const STATUS: Record<string, number> = {
  CABINET_NOT_FOUND: 404,
  NO_STRIPE_CUSTOMER: 409,
  NO_PENDING_CHANGE: 409,
  STRIPE_FAILED: 502,
};

export async function POST(request: Request) {
  const authz = await authorize(request, 'abonnement.gerer');
  if (authz.response) return authz.response;
  const { cabinetId, id: actorId } = authz.session.user as { cabinetId: string; id: string };

  const result = await cancelPlanChange(cabinetId, actorId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 502 });
  }

  return NextResponse.json({ success: true });
}
