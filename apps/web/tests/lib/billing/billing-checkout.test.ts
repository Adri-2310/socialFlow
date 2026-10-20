// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { cookieJar, testEmail, TEST_EMAIL_PREFIX } from '../../helpers/auth-test-utils';

vi.mock('@/lib/email/email', () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  sendOTPEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendChangeEmailConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendResetPasswordEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletedEmail: vi.fn().mockResolvedValue(undefined),
  sendDeleteAccountVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendGestionnaireInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendGestionnaireAccessChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentSuspensionEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const pricesList = vi.fn();
const pricesCreate = vi.fn();
const pricesUpdate = vi.fn();
const productsList = vi.fn();
const productsCreate = vi.fn();
const customersCreate = vi.fn();
const sessionsCreate = vi.fn();
const sessionsRetrieve = vi.fn();
vi.mock('@/lib/billing/stripe', () => ({
  stripe: {
    prices: { list: pricesList, create: pricesCreate, update: pricesUpdate },
    products: { list: productsList, create: productsCreate },
    customers: { create: customersCreate },
    checkout: { sessions: { create: sessionsCreate, retrieve: sessionsRetrieve } },
  },
}));

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const { createCheckoutSession, confirmCheckoutSession, getCheckoutSummary } = await import(
  '@/lib/billing/stripe-checkout'
);
const { POST: checkoutRoute } = await import('@/app/api/billing/checkout/route');
const { POST: confirmRoute } = await import('@/app/api/billing/checkout/confirm/route');

const APP_URL = 'http://localhost:3000';
const PASSWORD = 'InitialPass123!';
const stamp = Date.now();
const cabinetIds: string[] = [];
let counter = 0;

// Plan de test dedie : le prix est defini EN BASE (D58), les tests ne
// dependent donc pas des valeurs du catalogue reel.
//   mensuel : 50 EUR chaque mois          -> 5 000 centimes
//   annuel  : 40 EUR par mois, x12 par an -> 48 000 centimes
const PLAN = `vitest-checkout-${stamp}`;
const MONTHLY_CENTS = 5000;
const YEARLY_CENTS = 48000;

process.env.NEXT_PUBLIC_APP_URL = APP_URL;

const stripePrice = (id: string, period: 'monthly' | 'yearly', cents: number) => ({
  id,
  unit_amount: cents,
  currency: 'eur',
  recurring: { interval: period === 'yearly' ? 'year' : 'month' },
  metadata: { planId: PLAN, billingPeriod: period },
});

async function createCabinet(data: {
  planId?: string | null;
  billingPeriod?: string | null;
  billingStatus?: string;
  stripeCustomerId?: string | null;
  deletedAt?: Date | null;
} = {}) {
  counter += 1;
  const cabinet = await prisma.cabinet.create({
    data: { name: `checkout-test-${stamp}-${counter}`, ...data },
  });
  cabinetIds.push(cabinet.id);
  return cabinet;
}

const stateOf = (id: string) =>
  prisma.cabinet.findUniqueOrThrow({
    where: { id },
    select: {
      billingStatus: true,
      trialEndsAt: true,
      planId: true,
      billingPeriod: true,
      stripeCustomerId: true,
    },
  });

beforeAll(async () => {
  await prisma.pricingPlan.create({
    data: {
      planId: PLAN,
      name: 'Plan Test Checkout',
      description: 'plan de test',
      features: ['test'],
      monthlyPrice: 50,
      yearlyPrice: 40,
    },
  });
});

beforeEach(() => {
  // Par defaut, Stripe porte deja les bons prix (aucune creation necessaire).
  pricesList.mockReset().mockResolvedValue({
    data: [
      stripePrice('price_m', 'monthly', MONTHLY_CENTS),
      stripePrice('price_y', 'yearly', YEARLY_CENTS),
    ],
  });
  pricesCreate.mockReset().mockResolvedValue({ id: 'price_cree' });
  pricesUpdate.mockReset().mockResolvedValue({});
  productsList.mockReset().mockResolvedValue({ data: [{ id: 'prod_plan', metadata: { planId: PLAN } }] });
  productsCreate.mockReset().mockResolvedValue({ id: 'prod_cree' });
  customersCreate.mockReset().mockImplementation(() => Promise.resolve({ id: `cus_ck_${stamp}_${++counter}` }));
  sessionsCreate.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_abc' });
  sessionsRetrieve.mockReset();
});

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const ids = [
    ...cabinetIds,
    ...testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id),
  ];
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: ids } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.pricingPlan.deleteMany({ where: { planId: PLAN } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

describe('createCheckoutSession (D25, D32)', () => {
  it('cree le client, puis une session avec carte obligatoire et essai de 30 jours', async () => {
    const cabinet = await createCabinet({ planId: PLAN, billingPeriod: 'monthly' });

    const result = await createCheckoutSession(cabinet.id, APP_URL);

    expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_abc' });
    expect(customersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { cabinetId: cabinet.id } }),
    );

    const params = sessionsCreate.mock.calls[0][0];
    expect(params).toMatchObject({
      mode: 'subscription',
      client_reference_id: cabinet.id,
      line_items: [{ price: 'price_m', quantity: 1 }],
      payment_method_collection: 'always',
      subscription_data: { trial_period_days: 30, metadata: { cabinetId: cabinet.id } },
      metadata: { cabinetId: cabinet.id },
    });
    expect(params.success_url).toContain(
      '/dashboard/cabinet/paiement?retour=ok&session_id={CHECKOUT_SESSION_ID}',
    );
    expect(params.cancel_url).toBe(`${APP_URL}/dashboard/cabinet/paiement?retour=annule`);

    const state = await stateOf(cabinet.id);
    expect(state.stripeCustomerId).toBe(params.customer);
  });

  it('prend le prix de la periode du cabinet, pas de la requete', async () => {
    const cabinet = await createCabinet({ planId: PLAN, billingPeriod: 'yearly' });

    await createCheckoutSession(cabinet.id, APP_URL);

    expect(sessionsCreate.mock.calls[0][0].line_items).toEqual([{ price: 'price_y', quantity: 1 }]);
  });

  it('reutilise le client Stripe deja relie au cabinet', async () => {
    const cabinet = await createCabinet({
      planId: PLAN,
      billingPeriod: 'monthly',
      stripeCustomerId: `cus_existant_${stamp}`,
    });

    await createCheckoutSession(cabinet.id, APP_URL);

    expect(customersCreate).not.toHaveBeenCalled();
    expect(sessionsCreate.mock.calls[0][0].customer).toBe(`cus_existant_${stamp}`);
  });

  it('refuse un cabinet sans plan', async () => {
    const cabinet = await createCabinet();
    expect(await createCheckoutSession(cabinet.id, APP_URL)).toEqual({
      ok: false,
      error: 'PLAN_REQUIRED',
    });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it.each(['ESSAI', 'ACTIF', 'DELAI_GRACE', 'IMPAYE', 'RESILIE'])(
    'refuse un second abonnement quand le cabinet est en %s',
    async (billingStatus) => {
      const cabinet = await createCabinet({ planId: PLAN, billingPeriod: 'monthly', billingStatus });
      expect(await createCheckoutSession(cabinet.id, APP_URL)).toEqual({
        ok: false,
        error: 'SUBSCRIPTION_ALREADY_STARTED',
      });
      expect(sessionsCreate).not.toHaveBeenCalled();
    },
  );

  it('refuse un plan qui n existe plus ou n a pas de prix', async () => {
    const inconnu = await createCabinet({ planId: `plan-fantome-${stamp}`, billingPeriod: 'monthly' });
    expect(await createCheckoutSession(inconnu.id, APP_URL)).toEqual({
      ok: false,
      error: 'PRICE_NOT_FOUND',
    });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('signale un echec de Stripe sans planter', async () => {
    const cabinet = await createCabinet({ planId: PLAN, billingPeriod: 'monthly' });
    sessionsCreate.mockRejectedValue(new Error('stripe down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await createCheckoutSession(cabinet.id, APP_URL)).toEqual({
      ok: false,
      error: 'CHECKOUT_FAILED',
    });
  });

  it('ignore un cabinet inexistant ou archive', async () => {
    expect(await createCheckoutSession('cabinet-inexistant', APP_URL)).toEqual({
      ok: false,
      error: 'CABINET_NOT_FOUND',
    });
    const archive = await createCabinet({ planId: PLAN, deletedAt: new Date() });
    expect(await createCheckoutSession(archive.id, APP_URL)).toEqual({
      ok: false,
      error: 'CABINET_NOT_FOUND',
    });
  });

  describe('le prix vient de la base, jamais d un Price Stripe perime (D58)', () => {
    it('recale le Price Stripe quand son montant ne correspond plus a la base', async () => {
      const cabinet = await createCabinet({ planId: PLAN, billingPeriod: 'yearly' });
      // Ancien Price annuel : le prix mensuel equivalent facture une seule fois.
      pricesList.mockResolvedValue({
        data: [stripePrice('price_y_perime', 'yearly', 4000)],
      });

      await createCheckoutSession(cabinet.id, APP_URL);

      expect(pricesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          product: 'prod_plan',
          unit_amount: YEARLY_CENTS,
          recurring: { interval: 'year' },
          metadata: { planId: PLAN, billingPeriod: 'yearly' },
        }),
      );
      expect(pricesUpdate).toHaveBeenCalledWith('price_y_perime', { active: false });
      expect(sessionsCreate.mock.calls[0][0].line_items).toEqual([
        { price: 'price_cree', quantity: 1 },
      ]);
    });

    it('cree le Price quand Stripe n en porte aucun, et le produit au besoin', async () => {
      const cabinet = await createCabinet({ planId: PLAN, billingPeriod: 'monthly' });
      pricesList.mockResolvedValue({ data: [] });
      productsList.mockResolvedValue({ data: [] });

      await createCheckoutSession(cabinet.id, APP_URL);

      expect(productsCreate).toHaveBeenCalledWith({
        name: 'Plan Test Checkout',
        metadata: { planId: PLAN },
      });
      expect(pricesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          product: 'prod_cree',
          unit_amount: MONTHLY_CENTS,
          recurring: { interval: 'month' },
        }),
      );
      expect(pricesUpdate).not.toHaveBeenCalled();
    });

    it('ne cree rien quand le Price Stripe correspond deja a la base', async () => {
      const cabinet = await createCabinet({ planId: PLAN, billingPeriod: 'monthly' });

      await createCheckoutSession(cabinet.id, APP_URL);

      expect(pricesCreate).not.toHaveBeenCalled();
      expect(pricesUpdate).not.toHaveBeenCalled();
    });

    it('suit une modification du prix en base sans intervention', async () => {
      const cabinet = await createCabinet({ planId: PLAN, billingPeriod: 'monthly' });
      await prisma.pricingPlan.update({ where: { planId: PLAN }, data: { monthlyPrice: 60 } });
      try {
        await createCheckoutSession(cabinet.id, APP_URL);

        expect(pricesCreate).toHaveBeenCalledWith(
          expect.objectContaining({ unit_amount: 6000, recurring: { interval: 'month' } }),
        );
      } finally {
        await prisma.pricingPlan.update({ where: { planId: PLAN }, data: { monthlyPrice: 50 } });
      }
    });

    it('refuse un plan annuel sans prix annuel en base', async () => {
      const cabinet = await createCabinet({ planId: PLAN, billingPeriod: 'yearly' });
      await prisma.pricingPlan.update({ where: { planId: PLAN }, data: { yearlyPrice: null } });
      try {
        expect(await createCheckoutSession(cabinet.id, APP_URL)).toEqual({
          ok: false,
          error: 'PRICE_NOT_FOUND',
        });
      } finally {
        await prisma.pricingPlan.update({ where: { planId: PLAN }, data: { yearlyPrice: 40 } });
      }
    });
  });
});

describe('confirmCheckoutSession', () => {
  const NOW = Math.floor(Date.now() / 1000);

  function completeSession(cabinetId: string, customer: string, extra: Record<string, unknown> = {}) {
    return {
      id: 'cs_test_abc123',
      status: 'complete',
      client_reference_id: cabinetId,
      metadata: { cabinetId },
      subscription: {
        id: 'sub_ck',
        object: 'subscription',
        customer,
        status: 'trialing',
        created: NOW,
        trial_end: NOW + 30 * 86_400,
        metadata: { cabinetId },
        items: {
          data: [
            {
              current_period_end: NOW + 30 * 86_400,
              price: { metadata: { planId: PLAN, billingPeriod: 'monthly' } },
            },
          ],
        },
      },
      ...extra,
    };
  }

  it('passe le cabinet en essai avec la fin d essai de Stripe', async () => {
    const customer = `cus_confirm_${stamp}`;
    const cabinet = await createCabinet({
      planId: PLAN,
      billingPeriod: 'monthly',
      stripeCustomerId: customer,
    });
    sessionsRetrieve.mockResolvedValue(completeSession(cabinet.id, customer));

    expect(await confirmCheckoutSession(cabinet.id, 'cs_test_abc123')).toEqual({ ok: true });

    const state = await stateOf(cabinet.id);
    expect(state.billingStatus).toBe('ESSAI');
    expect(state.trialEndsAt?.getTime()).toBe((NOW + 30 * 86_400) * 1000);
  });

  it('est idempotent', async () => {
    const customer = `cus_confirm2_${stamp}`;
    const cabinet = await createCabinet({ stripeCustomerId: customer });
    sessionsRetrieve.mockResolvedValue(completeSession(cabinet.id, customer));

    await confirmCheckoutSession(cabinet.id, 'cs_test_abc123');
    await confirmCheckoutSession(cabinet.id, 'cs_test_abc123');

    const audits = await prisma.auditLog.count({
      where: { cabinetId: cabinet.id, action: 'BILLING_STATUS_CHANGED' },
    });
    expect(audits).toBe(1);
  });

  it('traite la session d un autre cabinet comme introuvable', async () => {
    const mine = await createCabinet({ stripeCustomerId: `cus_mine_${stamp}` });
    const other = await createCabinet({ stripeCustomerId: `cus_other_${stamp}` });
    sessionsRetrieve.mockResolvedValue(completeSession(other.id, `cus_other_${stamp}`));

    expect(await confirmCheckoutSession(mine.id, 'cs_test_abc123')).toEqual({
      ok: false,
      error: 'SESSION_NOT_FOUND',
    });
    expect((await stateOf(mine.id)).billingStatus).toBe('EN_ATTENTE_PAIEMENT');
    expect((await stateOf(other.id)).billingStatus).toBe('EN_ATTENTE_PAIEMENT');
  });

  it('refuse une session non terminee', async () => {
    const cabinet = await createCabinet();
    sessionsRetrieve.mockResolvedValue({
      id: 'cs_test_abc123',
      status: 'open',
      client_reference_id: cabinet.id,
      subscription: null,
    });

    expect(await confirmCheckoutSession(cabinet.id, 'cs_test_abc123')).toEqual({
      ok: false,
      error: 'CHECKOUT_NOT_COMPLETED',
    });
  });

  it('traite une session que Stripe ne connait pas comme introuvable', async () => {
    const cabinet = await createCabinet();
    sessionsRetrieve.mockRejectedValue(new Error('No such checkout.session'));

    expect(await confirmCheckoutSession(cabinet.id, 'cs_test_zzz')).toEqual({
      ok: false,
      error: 'SESSION_NOT_FOUND',
    });
  });
});

describe('getCheckoutSummary (prix lu en base, D58)', () => {
  it('mensuel : le montant facture chaque mois', async () => {
    const cabinet = await createCabinet({ planId: PLAN, billingPeriod: 'monthly' });

    expect(await getCheckoutSummary(cabinet.id)).toEqual({
      planName: 'Plan Test Checkout',
      billingPeriod: 'monthly',
      amount: 50,
      currency: 'EUR',
    });
  });

  it('annuel : le total de l annee (12 x le prix mensuel equivalent)', async () => {
    const cabinet = await createCabinet({ planId: PLAN, billingPeriod: 'yearly' });

    const summary = await getCheckoutSummary(cabinet.id);

    expect(summary?.billingPeriod).toBe('yearly');
    expect(summary?.amount).toBe(480);
  });

  it('ne depend pas de Stripe', async () => {
    pricesList.mockRejectedValue(new Error('stripe down'));
    const cabinet = await createCabinet({ planId: PLAN, billingPeriod: 'monthly' });

    expect((await getCheckoutSummary(cabinet.id))?.amount).toBe(50);
    expect(pricesList).not.toHaveBeenCalled();
  });

  it('renvoie null pour un cabinet sans plan', async () => {
    const cabinet = await createCabinet();
    expect(await getCheckoutSummary(cabinet.id)).toBeNull();
  });
});

describe('routes /api/billing/checkout', () => {
  async function creerCabinetRH(label: string) {
    const mail = testEmail(label);
    const cj = cookieJar();
    cj.apply(
      await auth.api.signUpEmail({
        body: { name: 'Titulaire Checkout', email: mail, password: PASSWORD },
        asResponse: true,
      }),
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    return { cj, user };
  }

  function post(url: string, cj?: ReturnType<typeof cookieJar>, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const cookie = cj?.headers().get('cookie');
    if (cookie) headers.cookie = cookie;
    return new Request(url, {
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it('refuse sans session', async () => {
    expect((await checkoutRoute(post(`${APP_URL}/api/billing/checkout`))).status).toBe(401);
    expect((await confirmRoute(post(`${APP_URL}/api/billing/checkout/confirm`))).status).toBe(401);
  });

  it('refuse un role autre que Cabinet RH', async () => {
    const { cj, user } = await creerCabinetRH('checkout-role');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'GESTIONNAIRE_RH' } });

    expect((await checkoutRoute(post(`${APP_URL}/api/billing/checkout`, cj))).status).toBe(403);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('demarre le Checkout du cabinet de la session', async () => {
    const { cj, user } = await creerCabinetRH('checkout-route');
    await prisma.cabinet.update({
      where: { id: user.cabinetId! },
      data: { planId: PLAN, billingPeriod: 'monthly' },
    });

    const res = await checkoutRoute(post(`${APP_URL}/api/billing/checkout`, cj));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_abc' });
    expect(sessionsCreate.mock.calls[0][0].client_reference_id).toBe(user.cabinetId);
  });

  it('renvoie 409 quand l abonnement est deja demarre', async () => {
    const { cj, user } = await creerCabinetRH('checkout-deja');
    await prisma.cabinet.update({
      where: { id: user.cabinetId! },
      data: { planId: PLAN, billingPeriod: 'monthly', billingStatus: 'ESSAI' },
    });

    const res = await checkoutRoute(post(`${APP_URL}/api/billing/checkout`, cj));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'SUBSCRIPTION_ALREADY_STARTED' });
  });

  it('valide le format de l identifiant de session a la confirmation', async () => {
    const { cj } = await creerCabinetRH('checkout-confirm-format');

    const res = await confirmRoute(
      post(`${APP_URL}/api/billing/checkout/confirm`, cj, { sessionId: 'pas-une-session' }),
    );
    expect(res.status).toBe(400);
    expect(sessionsRetrieve).not.toHaveBeenCalled();
  });
});
