// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const stripePricesList = vi.fn();
const stripeCustomersCreate = vi.fn();
const stripeSubscriptionsCreate = vi.fn();
vi.mock('@/lib/stripe', () => ({
  stripe: {
    prices: { list: stripePricesList },
    customers: { create: stripeCustomersCreate },
    subscriptions: { create: stripeSubscriptionsCreate },
  },
}));

const { prisma } = await import('@/lib/prisma');
const { provisionStripeTrial } = await import('@/lib/stripe-trial');

const TEST_CABINET_PREFIX = 'stripe-trial-test-';

afterAll(async () => {
  await prisma.cabinet.deleteMany({ where: { name: { startsWith: TEST_CABINET_PREFIX } } });
});

async function creerCabinetTest(label: string, stripeCustomerId: string | null = null) {
  return prisma.cabinet.create({ data: { name: `${TEST_CABINET_PREFIX}${label}`, stripeCustomerId } });
}

beforeEach(() => {
  stripePricesList.mockReset().mockResolvedValue({ data: [] });
  stripeCustomersCreate.mockReset().mockResolvedValue({ id: 'cus_nouveau' });
  stripeSubscriptionsCreate.mockReset().mockResolvedValue({ id: 'sub_nouveau' });
});

describe('provisionStripeTrial', () => {
  it("ne fait rien si le cabinet a deja un stripeCustomerId", async () => {
    const cabinet = await creerCabinetTest('deja-provisionne', 'cus_existant');

    await provisionStripeTrial(cabinet.id, 'starter', 'monthly');

    expect(stripeCustomersCreate).not.toHaveBeenCalled();
    const unchanged = await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } });
    expect(unchanged.stripeCustomerId).toBe('cus_existant');
  });

  it("ne fait rien si aucun Price Stripe ne correspond au plan/periode demandes", async () => {
    const cabinet = await creerCabinetTest('sans-price');
    stripePricesList.mockResolvedValue({ data: [] });

    await provisionStripeTrial(cabinet.id, 'plan-sans-stripe', 'monthly');

    expect(stripeCustomersCreate).not.toHaveBeenCalled();
    const unchanged = await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } });
    expect(unchanged.stripeCustomerId).toBeNull();
  });

  it("cree un Customer et une Subscription en essai de 30 jours sans moyen de paiement, puis ecrit stripeCustomerId", async () => {
    const cabinet = await creerCabinetTest('provisioning-ok');
    stripePricesList.mockResolvedValue({
      data: [{ id: 'price_monthly', metadata: { planId: 'starter', billingPeriod: 'monthly' } }],
    });

    await provisionStripeTrial(cabinet.id, 'starter', 'monthly');

    expect(stripeCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { cabinetId: cabinet.id } }),
    );
    expect(stripeSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_nouveau',
        items: [{ price: 'price_monthly' }],
        trial_period_days: 30,
      }),
    );
    expect(stripeSubscriptionsCreate.mock.calls[0][0]).not.toHaveProperty('default_payment_method');

    const updated = await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } });
    expect(updated.stripeCustomerId).toBe('cus_nouveau');
  });

  it('distingue bien la periode mensuelle de la periode annuelle', async () => {
    const cabinet = await creerCabinetTest('periode-annuelle');
    // Cabinet.stripeCustomerId est unique en base : un id different du test
    // precedent, qui a deja ecrit 'cus_nouveau' sur un autre cabinet.
    stripeCustomersCreate.mockResolvedValue({ id: 'cus_annuel' });
    stripePricesList.mockResolvedValue({
      data: [
        { id: 'price_monthly', metadata: { planId: 'pro', billingPeriod: 'monthly' } },
        { id: 'price_yearly', metadata: { planId: 'pro', billingPeriod: 'yearly' } },
      ],
    });

    await provisionStripeTrial(cabinet.id, 'pro', 'yearly');

    expect(stripeSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ price: 'price_yearly' }] }),
    );
  });
});
