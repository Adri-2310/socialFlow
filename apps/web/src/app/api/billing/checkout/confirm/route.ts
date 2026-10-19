import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { confirmCheckoutSession } from '@/lib/stripe-checkout';

// Confirme un Checkout au retour du client (voir lib/stripe-checkout.ts) :
// applique l'abonnement au cabinet sans attendre le webhook. Idempotent.
const STATUS: Record<string, number> = {
  SESSION_NOT_FOUND: 404,
  CHECKOUT_NOT_COMPLETED: 409,
  CHECKOUT_FAILED: 502,
};

export async function POST(request: Request) {
  const authz = await authorize(request, 'abonnement.gerer');
  if (authz.response) return authz.response;
  const cabinetId = authz.session.user.cabinetId as string;

  const body = await request.json().catch(() => null);
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  // Format Checkout : cs_test_... / cs_live_...
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const result = await confirmCheckoutSession(cabinetId, sessionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 502 });
  }

  return NextResponse.json({ success: true });
}
