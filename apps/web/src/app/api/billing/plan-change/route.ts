import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/authz';
import { schedulePlanChange } from '@/lib/plan-change';

// Programme un changement de plan ou de periodicite en fin de periode (D60).
// Reserve au Cabinet RH, pour son cabinet (cabinetId de la session). Le plan
// vise est valide cote serveur : existence, plan non archive, prix defini en
// base et quotas respectes.
const bodySchema = z.object({
  planId: z.string().trim().min(1).max(100),
  billingPeriod: z.enum(['monthly', 'yearly']),
});

const STATUS: Record<string, number> = {
  CABINET_NOT_FOUND: 404,
  NO_STRIPE_CUSTOMER: 409,
  NO_SUBSCRIPTION: 409,
  PLAN_CHANGE_NOT_ALLOWED: 409,
  RESUME_FIRST: 409,
  SAME_PLAN: 409,
  PLAN_UNAVAILABLE: 404,
  PRICE_NOT_SET: 409,
  QUOTA_EXCEEDED: 403,
  STRIPE_FAILED: 502,
};

export async function POST(request: Request) {
  const authz = await authorize(request, 'abonnement.gerer');
  if (authz.response) return authz.response;
  const { cabinetId, id: actorId } = authz.session.user as { cabinetId: string; id: string };

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const result = await schedulePlanChange(cabinetId, actorId, parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.blockers ? { blockers: result.blockers } : {}) },
      { status: STATUS[result.error] ?? 502 },
    );
  }

  return NextResponse.json({ success: true, effectiveAt: result.effectiveAt.toISOString() });
}
