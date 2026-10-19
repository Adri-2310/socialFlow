import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { createCheckoutSession } from '@/lib/stripe-checkout';

// Demarre le paiement de l'abonnement du cabinet (D25, D32) : renvoie l'URL
// de la page Checkout de Stripe. Reserve au Cabinet RH, pour son cabinet ;
// le plan vient du cabinet, jamais du corps de la requete. Volontairement
// sans `writable` : c'est precisement ce qui permet de sortir d'un etat
// "en attente de paiement".
const STATUS: Record<string, number> = {
  CABINET_NOT_FOUND: 404,
  PLAN_REQUIRED: 409,
  SUBSCRIPTION_ALREADY_STARTED: 409,
  PRICE_NOT_FOUND: 502,
  CHECKOUT_FAILED: 502,
};

export async function POST(request: Request) {
  const authz = await authorize(request, 'abonnement.gerer');
  if (authz.response) return authz.response;
  const cabinetId = authz.session.user.cabinetId as string;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json({ error: 'CHECKOUT_FAILED' }, { status: 502 });
  }

  const result = await createCheckoutSession(cabinetId, appUrl);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 502 });
  }

  return NextResponse.json({ url: result.url });
}
