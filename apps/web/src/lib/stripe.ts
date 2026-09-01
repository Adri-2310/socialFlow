import Stripe from 'stripe';

// Cle secrete fournie par l'integration Vercel Marketplace (voir
// `vercel integration add stripe`), jamais commise (STRIPE_SECRET_KEY dans
// .env.local, gitignore). Mode sandbox/test tant que la ressource n'est pas
// "claimed" en production.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
