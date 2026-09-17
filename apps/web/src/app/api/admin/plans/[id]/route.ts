import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

type PlanUpdateBody = {
  name: string;
  description: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  badge: string | null;
  highlighted: boolean;
  sortOrder: number;
  features: string[];
};

function parseBody(body: unknown): PlanUpdateBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  if (typeof b.name !== 'string' || !b.name.trim()) return null;
  if (typeof b.description !== 'string' || !b.description.trim()) return null;
  if (b.monthlyPrice !== null && (typeof b.monthlyPrice !== 'number' || !Number.isInteger(b.monthlyPrice))) return null;
  if (b.yearlyPrice !== null && (typeof b.yearlyPrice !== 'number' || !Number.isInteger(b.yearlyPrice))) return null;
  if (b.badge !== null && typeof b.badge !== 'string') return null;
  if (typeof b.highlighted !== 'boolean') return null;
  if (typeof b.sortOrder !== 'number') return null;
  if (!Array.isArray(b.features) || !b.features.every((f) => typeof f === 'string')) return null;

  const features = (b.features as string[]).map((f) => f.trim()).filter(Boolean);
  if (features.length === 0) return null;

  return {
    name: b.name.trim(),
    description: b.description.trim(),
    monthlyPrice: b.monthlyPrice as number | null,
    yearlyPrice: b.yearlyPrice as number | null,
    badge: (b.badge as string | null)?.trim() || null,
    highlighted: b.highlighted,
    sortOrder: b.sortOrder,
    features,
  };
}

// Un Price Stripe est immuable (montant fige a sa creation) : changer un
// prix revient a desactiver l'ancien et en creer un nouveau, jamais a le
// modifier en place. Ne touche Stripe que si le montant a reellement change,
// pour ne pas empiler des Price inutiles a chaque edition de texte du plan.
async function syncStripePrice(
  planId: string,
  billingPeriod: 'monthly' | 'yearly',
  interval: 'month' | 'year',
  previousAmount: number | null,
  newAmount: number | null,
) {
  if (previousAmount === newAmount) return;

  const prices = await stripe.prices.list({ limit: 100, active: true });
  const current = prices.data.find(
    (p) => p.metadata.planId === planId && p.metadata.billingPeriod === billingPeriod,
  );

  if (current) {
    await stripe.prices.update(current.id, { active: false });
  }

  if (newAmount === null) return;

  const products = await stripe.products.list({ limit: 100, active: true });
  const product = products.data.find((p) => p.metadata.planId === planId);
  if (!product) {
    throw new Error('STRIPE_PRODUCT_NOT_FOUND');
  }

  await stripe.prices.create({
    product: product.id,
    currency: 'eur',
    unit_amount: Math.round(newAmount * 100),
    recurring: { interval },
    metadata: { planId, billingPeriod },
  });
}

// Archivage/restauration (voir DELETE/PUT ci-dessous) : bascule `active` sur
// le Product et sur le(s) Price existants plutot que d'en creer de nouveaux -
// contrairement au montant, `active` est modifiable dans les deux sens sur
// un Price Stripe.
async function setPlanStripeActive(planId: string, active: boolean) {
  const [products, prices] = await Promise.all([
    stripe.products.list({ limit: 100 }),
    stripe.prices.list({ limit: 100 }),
  ]);

  const product = products.data.find((p) => p.metadata.planId === planId);
  if (product) {
    await stripe.products.update(product.id, { active });
  }

  if (active) {
    // Restauration : ne reactive que le Price le plus recent de chaque
    // periode (Stripe liste du plus recent au plus ancien, voir
    // getPricingPlansConfig dans lib/admin-data.ts) - jamais un ancien Price
    // deja desactive par un changement de prix avant l'archivage.
    for (const billingPeriod of ['monthly', 'yearly'] as const) {
      const current = prices.data.find(
        (p) => p.metadata.planId === planId && p.metadata.billingPeriod === billingPeriod,
      );
      if (current) {
        await stripe.prices.update(current.id, { active: true });
      }
    }
  } else {
    // Archivage : desactive uniquement ce qui est actif (au plus un Price
    // actif par periode a la fois, voir syncStripePrice).
    for (const price of prices.data.filter((p) => p.metadata.planId === planId && p.active)) {
      await stripe.prices.update(price.id, { active: false });
    }
  }
}

// Edition des plans tarifaires par un SuperAdmin (page Configuration). Meme
// mecanisme d'autorisation que api/admin/cabinets|users/[id]/route.ts. La
// synchronisation Stripe est faite AVANT la mise a jour en base : si Stripe
// echoue, on ne veut pas se retrouver avec un prix affiche qui ne correspond
// a aucun Price reellement facturable.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { id: planId } = await params;

  const body = parseBody(await request.json().catch(() => null));
  if (!body) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const plan = await prisma.pricingPlan.findUnique({ where: { id: planId } });
  if (!plan) {
    return NextResponse.json({ error: 'PLAN_NOT_FOUND' }, { status: 404 });
  }
  if (plan.archivedAt) {
    return NextResponse.json({ error: 'PLAN_ARCHIVED' }, { status: 400 });
  }

  try {
    await syncStripePrice(plan.planId, 'monthly', 'month', plan.monthlyPrice, body.monthlyPrice);
    await syncStripePrice(plan.planId, 'yearly', 'year', plan.yearlyPrice, body.yearlyPrice);
  } catch {
    return NextResponse.json({ error: 'STRIPE_SYNC_FAILED' }, { status: 502 });
  }

  await prisma.pricingPlan.update({ where: { id: planId }, data: body });
  await prisma.auditLog.create({
    data: { action: 'PRICING_PLAN_UPDATED', actorId: session.user.id },
  });

  return NextResponse.json({ success: true });
}

// Archive un plan : retire du catalogue Product+Price Stripe (voir
// setPlanStripeActive) et le sort de /tarifs (voir getPricingPlans dans
// lib/pricing.ts), sans supprimer la ligne ni casser les cabinets deja sur ce
// plan (lecture directe par planId dans profil/page.tsx, non filtree).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { id: planId } = await params;

  const plan = await prisma.pricingPlan.findUnique({ where: { id: planId } });
  if (!plan) {
    return NextResponse.json({ error: 'PLAN_NOT_FOUND' }, { status: 404 });
  }
  if (plan.archivedAt) {
    return NextResponse.json({ error: 'PLAN_ALREADY_ARCHIVED' }, { status: 400 });
  }

  try {
    await setPlanStripeActive(plan.planId, false);
  } catch {
    return NextResponse.json({ error: 'STRIPE_SYNC_FAILED' }, { status: 502 });
  }

  await prisma.pricingPlan.update({ where: { id: planId }, data: { archivedAt: new Date() } });
  await prisma.auditLog.create({
    data: { action: 'PRICING_PLAN_ARCHIVED', actorId: session.user.id },
  });

  return NextResponse.json({ success: true });
}

// Restaure un plan archive : reactive le Product+Price Stripe existants (les
// memes objets, jamais de recreation) et le remet sur /tarifs.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { id: planId } = await params;

  const plan = await prisma.pricingPlan.findUnique({ where: { id: planId } });
  if (!plan) {
    return NextResponse.json({ error: 'PLAN_NOT_FOUND' }, { status: 404 });
  }
  if (!plan.archivedAt) {
    return NextResponse.json({ error: 'PLAN_NOT_ARCHIVED' }, { status: 400 });
  }

  try {
    await setPlanStripeActive(plan.planId, true);
  } catch {
    return NextResponse.json({ error: 'STRIPE_SYNC_FAILED' }, { status: 502 });
  }

  await prisma.pricingPlan.update({ where: { id: planId }, data: { archivedAt: null } });
  await prisma.auditLog.create({
    data: { action: 'PRICING_PLAN_RESTORED', actorId: session.user.id },
  });

  return NextResponse.json({ success: true });
}
