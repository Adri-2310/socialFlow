import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz/authz';
import { createCardUpdateSession } from '@/lib/billing/cabinet-subscription';

// Demarre la saisie d'une nouvelle carte (D59) : renvoie l'URL de la page
// Stripe. Reserve au Cabinet RH, pour son cabinet. Volontairement sans
// `writable` : un cabinet en lecture seule pour impaye doit pouvoir changer
// de carte pour regulariser (D29, D57).
const STATUS: Record<string, number> = {
  CABINET_NOT_FOUND: 404,
  NO_STRIPE_CUSTOMER: 409,
  STRIPE_FAILED: 502,
};

export async function POST(request: Request) {
  const authz = await authorize(request, 'abonnement.gerer');
  if (authz.response) return authz.response;
  const cabinetId = authz.session.user.cabinetId as string;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return NextResponse.json({ error: 'STRIPE_FAILED' }, { status: 502 });

  const result = await createCardUpdateSession(cabinetId, appUrl);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 502 });
  }

  return NextResponse.json({ url: result.url });
}
