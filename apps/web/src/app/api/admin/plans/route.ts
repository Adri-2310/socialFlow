import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

type PlanCreateBody = {
  planId: string;
  name: string;
  description: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  badge: string | null;
  highlighted: boolean;
  sortOrder: number;
  features: string[];
};

// Minuscules/chiffres/tirets uniquement : sert de metadata Stripe et
// d'identifiant stable dans le code (voir PlanId dans lib/plans.ts).
const PLAN_ID_PATTERN = /^[a-z0-9-]+$/;

function parseBody(body: unknown): PlanCreateBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  if (typeof b.planId !== 'string' || !PLAN_ID_PATTERN.test(b.planId)) return null;
  if (typeof b.name !== 'string' || !b.name.trim()) return null;
  if (typeof b.description !== 'string' || !b.description.trim()) return null;
  if (b.monthlyPrice !== null && typeof b.monthlyPrice !== 'number') return null;
  if (b.yearlyPrice !== null && typeof b.yearlyPrice !== 'number') return null;
  if (b.badge !== null && typeof b.badge !== 'string') return null;
  if (typeof b.highlighted !== 'boolean') return null;
  if (typeof b.sortOrder !== 'number') return null;
  if (!Array.isArray(b.features) || !b.features.every((f) => typeof f === 'string')) return null;

  const features = (b.features as string[]).map((f) => f.trim()).filter(Boolean);
  if (features.length === 0) return null;

  return {
    planId: b.planId,
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

// Creation d'un nouveau plan tarifaire par un SuperAdmin (page Configuration).
// Le Product+Price Stripe sont crees D'ABORD : on ne veut jamais d'une ligne
// PricingPlan (donc visible sur /tarifs) sans contrepartie Stripe reelle
// derriere - si Stripe echoue, rien n'est ecrit en base.
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = parseBody(await request.json().catch(() => null));
  if (!body) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const existing = await prisma.pricingPlan.findUnique({ where: { planId: body.planId } });
  if (existing) {
    return NextResponse.json({ error: 'PLAN_ID_TAKEN' }, { status: 409 });
  }

  try {
    const product = await stripe.products.create({ name: body.name, metadata: { planId: body.planId } });

    if (body.monthlyPrice !== null) {
      await stripe.prices.create({
        product: product.id,
        currency: 'eur',
        unit_amount: Math.round(body.monthlyPrice * 100),
        recurring: { interval: 'month' },
        metadata: { planId: body.planId, billingPeriod: 'monthly' },
      });
    }
    if (body.yearlyPrice !== null) {
      await stripe.prices.create({
        product: product.id,
        currency: 'eur',
        unit_amount: Math.round(body.yearlyPrice * 100),
        recurring: { interval: 'year' },
        metadata: { planId: body.planId, billingPeriod: 'yearly' },
      });
    }
  } catch {
    return NextResponse.json({ error: 'STRIPE_SYNC_FAILED' }, { status: 502 });
  }

  const plan = await prisma.pricingPlan.create({
    data: {
      planId: body.planId,
      name: body.name,
      description: body.description,
      monthlyPrice: body.monthlyPrice,
      yearlyPrice: body.yearlyPrice,
      badge: body.badge,
      highlighted: body.highlighted,
      sortOrder: body.sortOrder,
      features: body.features,
    },
  });
  await prisma.auditLog.create({
    data: { action: 'PRICING_PLAN_CREATED', actorId: session.user.id },
  });

  return NextResponse.json({ success: true, id: plan.id }, { status: 201 });
}
