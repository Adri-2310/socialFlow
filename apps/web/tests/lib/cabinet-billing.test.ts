// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { getCabinetSubscriptionDetails } from '@/lib/cabinet-billing';

const stamp = Date.now();
const PLAN = `vitest-billing-${stamp}`;
const cabinetIds: string[] = [];
let counter = 0;

async function createCabinet(data: Record<string, unknown> = {}) {
  counter += 1;
  const cabinet = await prisma.cabinet.create({
    data: { name: `billing-test-${stamp}-${counter}`, ...data },
  });
  cabinetIds.push(cabinet.id);
  return cabinet;
}

beforeAll(async () => {
  await prisma.pricingPlan.create({
    data: {
      planId: PLAN,
      name: 'Plan Test Facturation',
      description: 'plan de test',
      features: ['fonction A', 'fonction B'],
      monthlyPrice: 50,
      yearlyPrice: 40,
    },
  });
});

afterAll(async () => {
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
  await prisma.pricingPlan.deleteMany({ where: { planId: PLAN } });
});

describe('getCabinetSubscriptionDetails', () => {
  it('mensuel : le montant est le prix mensuel du plan, en centimes', async () => {
    const cabinet = await createCabinet({
      planId: PLAN,
      billingPeriod: 'monthly',
      billingStatus: 'ACTIF',
    });

    const details = await getCabinetSubscriptionDetails(cabinet.id);

    expect(details).toMatchObject({
      planName: 'Plan Test Facturation',
      features: ['fonction A', 'fonction B'],
      billingPeriod: 'monthly',
      status: 'ACTIF',
      amountCents: 5000,
      monthlyEquivalentCents: null,
    });
  });

  it('annuel : 12 fois le prix mensuel equivalent, avec le mensuel en information (D58)', async () => {
    const cabinet = await createCabinet({ planId: PLAN, billingPeriod: 'yearly' });

    const details = await getCabinetSubscriptionDetails(cabinet.id);

    expect(details.amountCents).toBe(48000);
    expect(details.monthlyEquivalentCents).toBe(4000);
  });

  it('expose la fin du delai de grace seulement en DELAI_GRACE (D57)', async () => {
    const pastDueSince = new Date(Date.now() - 2 * 86_400_000);
    const grace = await createCabinet({
      planId: PLAN,
      billingPeriod: 'monthly',
      billingStatus: 'DELAI_GRACE',
      pastDueSince,
    });
    const actif = await createCabinet({
      planId: PLAN,
      billingPeriod: 'monthly',
      billingStatus: 'ACTIF',
      pastDueSince,
    });

    const inGrace = await getCabinetSubscriptionDetails(grace.id);
    expect(inGrace.graceEndsAt?.getTime()).toBe(pastDueSince.getTime() + 7 * 86_400_000);
    expect((await getCabinetSubscriptionDetails(actif.id)).graceEndsAt).toBeNull();
  });

  it('tolere un cabinet sans plan ou avec un plan disparu', async () => {
    const sansPlan = await createCabinet();
    const fantome = await createCabinet({ planId: `plan-fantome-${stamp}`, billingPeriod: 'monthly' });

    const a = await getCabinetSubscriptionDetails(sansPlan.id);
    expect(a).toMatchObject({ planName: null, amountCents: null, features: [] });

    const b = await getCabinetSubscriptionDetails(fantome.id);
    expect(b.planName).toBe(`plan-fantome-${stamp}`);
    expect(b.amountCents).toBeNull();
  });
});
