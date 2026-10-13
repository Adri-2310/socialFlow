import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { processStripeEvent } from '@/lib/stripe-webhook';

// Webhook Stripe (D57, roles/01-superadmin.md § 6.1). Pas de session : la
// seule authentification est la signature de l'evenement, verifiee sur le
// corps brut. Reponses : 400 signature invalide, 500 si le traitement echoue
// (Stripe rejoue alors l'evenement, l'idempotence evite tout effet double).
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Refuse plutot que de traiter des evenements non verifiables.
    return NextResponse.json({ error: 'WEBHOOK_NOT_CONFIGURED' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
  }

  // Corps brut obligatoire : la signature porte sur les octets exacts.
  const payload = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
  }

  try {
    const { duplicate } = await processStripeEvent(event);
    return NextResponse.json({ received: true, duplicate });
  } catch (error) {
    console.error('Echec du traitement du webhook Stripe', event.id, event.type, error);
    return NextResponse.json({ error: 'WEBHOOK_PROCESSING_FAILED' }, { status: 500 });
  }
}
