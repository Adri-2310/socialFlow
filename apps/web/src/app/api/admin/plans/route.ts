import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api-guard';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { stripeUnitAmountCents } from '@/lib/billing';

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
  // Quotas (D15) : null = illimite, absent = inchange.
  maxEntreprises?: number | null;
  maxUtilisateurs?: number | null;
  maxStorageMb?: number | null;
};

const isQuota = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0);

// Minuscules/chiffres/tirets uniquement : sert de metadata Stripe et
// d'identifiant stable dans le code (voir PlanId dans lib/plans.ts).
const PLAN_ID_PATTERN = /^[a-z0-9-]+$/;

function parseBody(body: unknown): PlanCreateBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  if (typeof b.planId !== 'string' || !PLAN_ID_PATTERN.test(b.planId)) return null;
  if (typeof b.name !== 'string' || !b.name.trim()) return null;
  if (typeof b.description !== 'string' || !b.description.trim()) return null;
  if (b.monthlyPrice !== null && (typeof b.monthlyPrice !== 'number' || !Number.isInteger(b.monthlyPrice))) return null;
  if (b.yearlyPrice !== null && (typeof b.yearlyPrice !== 'number' || !Number.isInteger(b.yearlyPrice))) return null;
  if (b.badge !== null && typeof b.badge !== 'string') return null;
  if (typeof b.highlighted !== 'boolean') return null;
  if (typeof b.sortOrder !== 'number') return null;
  if (!isQuota(b.maxEntreprises) || !isQuota(b.maxUtilisateurs) || !isQuota(b.maxStorageMb)) {
    return null;
  }
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
    maxEntreprises: b.maxEntreprises as number | null | undefined,
    maxUtilisateurs: b.maxUtilisateurs as number | null | undefined,
    maxStorageMb: b.maxStorageMb as number | null | undefined,
  };
}

// Creation d'un nouveau plan tarifaire par un SuperAdmin (page Configuration).
// Le Product+Price Stripe sont crees D'ABORD : on ne veut jamais d'une ligne
// PricingPlan (donc visible sur /tarifs) sans contrepartie Stripe reelle
// derriere - si Stripe echoue, rien n'est ecrit en base.
export async function POST(request: Request) {
  const guard = await requireApiSession(request, { role: 'SUPER_ADMIN' });
  if (guard.response) return guard.response;
  const { session } = guard;

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
        unit_amount: stripeUnitAmountCents(body.monthlyPrice, 'monthly'),
        recurring: { interval: 'month' },
        metadata: { planId: body.planId, billingPeriod: 'monthly' },
      });
    }
    if (body.yearlyPrice !== null) {
      await stripe.prices.create({
        product: product.id,
        currency: 'eur',
        // D58 : prix mensuel equivalent, facture une fois par an (x12).
        unit_amount: stripeUnitAmountCents(body.yearlyPrice, 'yearly'),
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
      maxEntreprises: body.maxEntreprises ?? null,
      maxUtilisateurs: body.maxUtilisateurs ?? null,
      maxStorageMb: body.maxStorageMb ?? null,
    },
  });
  await prisma.auditLog.create({
    data: { action: 'PRICING_PLAN_CREATED', actorId: session.user.id },
  });

  return NextResponse.json({ success: true, id: plan.id }, { status: 201 });
}
