// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { cookieJar, testEmail, TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

vi.mock('@/lib/email', () => ({
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
const customersCreate = vi.fn();
const sessionsCreate = vi.fn();
const sessionsRetrieve = vi.fn();
vi.mock('@/lib/stripe', () => ({
  stripe: {
    prices: { list: pricesList },
    customers: { create: customersCreate },
    checkout: { sessions: { create: sessionsCreate, retrieve: sessionsRetrieve } },
  },
}));

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const { createCheckoutSession, confirmCheckoutSession } = await import('@/lib/stripe-checkout');
const { POST: checkoutRoute } = await import('@/app/api/billing/checkout/route');
const { POST: confirmRoute } = await import('@/app/api/billing/checkout/confirm/route');

const APP_URL = 'http://localhost:3000';
const PASSWORD = 'InitialPass123!';
const stamp = Date.now();
const cabinetIds: string[] = [];
let counter = 0;

process.env.NEXT_PUBLIC_APP_URL = APP_URL;

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

beforeEach(() => {
  pricesList.mockReset().mockResolvedValue({
    data: [
      { id: 'price_starter_m', metadata: { planId: 'starter', billingPeriod: 'monthly' } },
      { id: 'price_pro_y', metadata: { planId: 'pro', billingPeriod: 'yearly' } },
    ],
  });
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
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

describe('createCheckoutSession (D25, D32)', () => {
  it('cree le client, puis une session avec carte obligatoire et essai de 30 jours', async () => {
    const cabinet = await createCabinet({ planId: 'starter', billingPeriod: 'monthly' });

    const result = await createCheckoutSession(cabinet.id, APP_URL);

    expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_abc' });
    expect(customersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { cabinetId: cabinet.id } }),
    );

    const params = sessionsCreate.mock.calls[0][0];
    expect(params).toMatchObject({
      mode: 'subscription',
      client_reference_id: cabinet.id,
      line_items: [{ price: 'price_starter_m', quantity: 1 }],
      payment_method_collection: 'always',
      subscription_data: { trial_period_days: 30, metadata: { cabinetId: cabinet.id } },
      metadata: { cabinetId: cabinet.id },
    });
    expect(params.success_url).toContain('/dashboard/cabinet?paiement=ok&session_id=');
    expect(params.cancel_url).toBe(`${APP_URL}/dashboard/cabinet?paiement=annule`);

    const state = await stateOf(cabinet.id);
    expect(state.stripeCustomerId).toBe(params.customer);
  });

  it('prend le prix du plan et de la periode du cabinet, pas de la requete', async () => {
    const cabinet = await createCabinet({ planId: 'pro', billingPeriod: 'yearly' });

    await createCheckoutSession(cabinet.id, APP_URL);

    expect(sessionsCreate.mock.calls[0][0].line_items).toEqual([
      { price: 'price_pro_y', quantity: 1 },
    ]);
  });

  it('reutilise le client Stripe deja relie au cabinet', async () => {
    const cabinet = await createCabinet({
      planId: 'starter',
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
      const cabinet = await createCabinet({ planId: 'starter', billingPeriod: 'monthly', billingStatus });
      expect(await createCheckoutSession(cabinet.id, APP_URL)).toEqual({
        ok: false,
        error: 'SUBSCRIPTION_ALREADY_STARTED',
      });
      expect(sessionsCreate).not.toHaveBeenCalled();
    },
  );

  it('refuse un plan sans prix Stripe', async () => {
    const cabinet = await createCabinet({ planId: 'enterprise', billingPeriod: 'monthly' });
    expect(await createCheckoutSession(cabinet.id, APP_URL)).toEqual({
      ok: false,
      error: 'PRICE_NOT_FOUND',
    });
  });

  it('signale un echec de Stripe sans planter', async () => {
    const cabinet = await createCabinet({ planId: 'starter', billingPeriod: 'monthly' });
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
    const archive = await createCabinet({ planId: 'starter', deletedAt: new Date() });
    expect(await createCheckoutSession(archive.id, APP_URL)).toEqual({
      ok: false,
      error: 'CABINET_NOT_FOUND',
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
              price: { metadata: { planId: 'starter', billingPeriod: 'monthly' } },
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
      planId: 'starter',
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

describe('routes /api/billing/checkout', () => {
  async function creerCabinetRH(label: string) {
    const mail = testEmail(label);
    const cj = cookieJar();
    cj.apply(
      await auth.api.signUpEmail({
        body: { name: 'Titulaire Checkout', email: mail, password: PASSWORD, plan: 'starter' },
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
      data: { planId: 'starter', billingPeriod: 'monthly' },
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
      data: { planId: 'starter', billingPeriod: 'monthly', billingStatus: 'ESSAI' },
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
