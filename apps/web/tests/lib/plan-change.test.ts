// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
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

const subsList = vi.fn();
const schedCreate = vi.fn();
const schedRetrieve = vi.fn();
const schedUpdate = vi.fn();
const schedRelease = vi.fn();
const pricesList = vi.fn();
const pricesCreate = vi.fn();
const pricesUpdate = vi.fn();
const productsList = vi.fn();
const productsCreate = vi.fn();
vi.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: { list: subsList },
    subscriptionSchedules: {
      create: schedCreate,
      retrieve: schedRetrieve,
      update: schedUpdate,
      release: schedRelease,
    },
    prices: { list: pricesList, create: pricesCreate, update: pricesUpdate },
    products: { list: productsList, create: productsCreate },
  },
}));

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const {
  quotaBlockers,
  getPlanChangeOptions,
  schedulePlanChange,
  cancelPlanChange,
  getPendingPlanChange,
} = await import('@/lib/plan-change');
const { POST: changeRoute } = await import('@/app/api/billing/plan-change/route');
const { POST: cancelRoute } = await import('@/app/api/billing/plan-change/cancel/route');

const APP_URL = 'http://localhost:3000';
const PASSWORD = 'InitialPass123!';
const stamp = Date.now();
const BIG = `vitest-pc-big-${stamp}`; // 50 EUR / mois, 40 EUR par mois en annuel, 10 gestionnaires
const SMALL = `vitest-pc-small-${stamp}`; // 20 EUR / mois, 1 gestionnaire
const cabinetIds: string[] = [];
let counter = 0;
let actorId = '';

process.env.NEXT_PUBLIC_APP_URL = APP_URL;

const DAY = 86_400;
const NOW = Math.floor(Date.now() / 1000);
const PERIOD_END = NOW + 20 * DAY;

async function createCabinet(data: Record<string, unknown> = {}) {
  counter += 1;
  const cabinet = await prisma.cabinet.create({
    data: {
      name: `plan-change-test-${stamp}-${counter}`,
      stripeCustomerId: `cus_pc_${stamp}_${counter}`,
      planId: BIG,
      billingPeriod: 'monthly',
      billingStatus: 'ACTIF',
      ...data,
    },
  });
  cabinetIds.push(cabinet.id);
  return cabinet;
}

const stripePrice = (id: string, planId: string, period: 'monthly' | 'yearly', cents: number) => ({
  id,
  unit_amount: cents,
  currency: 'eur',
  recurring: { interval: period === 'yearly' ? 'year' : 'month' },
  metadata: { planId, billingPeriod: period },
});

const subscription = (extra: Record<string, unknown> = {}) => ({
  id: 'sub_pc',
  status: 'active',
  schedule: null,
  items: { data: [{ price: { id: 'price_big_m' } }] },
  ...extra,
});

const scheduleObject = (extra: Record<string, unknown> = {}) => ({
  id: 'sub_sched_1',
  status: 'active',
  phases: [{ start_date: NOW - 10 * DAY, end_date: PERIOD_END, trial_end: null }],
  ...extra,
});

async function addMember(cabinetId: string, n: number) {
  for (let i = 0; i < n; i += 1) {
    counter += 1;
    await prisma.user.create({
      data: {
        id: `vitest-pc-user-${stamp}-${counter}`,
        name: `Gestionnaire ${counter}`,
        email: `${TEST_EMAIL_PREFIX}pc-${stamp}-${counter}@socialflow.page`,
        emailVerified: true,
        role: 'GESTIONNAIRE_RH',
        cabinetId,
      },
    });
  }
}

const audits = async (cabinetId: string) =>
  (await prisma.auditLog.findMany({ where: { cabinetId }, select: { action: true } })).map(
    (a) => a.action,
  );

beforeAll(async () => {
  await prisma.pricingPlan.createMany({
    data: [
      {
        planId: BIG,
        name: 'Plan Grand',
        description: 'plan de test',
        features: ['a'],
        monthlyPrice: 50,
        yearlyPrice: 40,
        maxUtilisateurs: 10,
        sortOrder: 901,
      },
      {
        planId: SMALL,
        name: 'Plan Petit',
        description: 'plan de test',
        features: ['b'],
        monthlyPrice: 20,
        yearlyPrice: 16,
        maxUtilisateurs: 1,
        sortOrder: 902,
      },
    ],
  });

  const mail = testEmail('pc-acteur');
  await auth.api.signUpEmail({ body: { name: 'Acteur Plan', email: mail, password: PASSWORD } });
  actorId = (await prisma.user.findUniqueOrThrow({ where: { email: mail } })).id;
});

beforeEach(() => {
  subsList.mockReset().mockResolvedValue({ data: [subscription()] });
  schedCreate.mockReset().mockResolvedValue(scheduleObject());
  schedRetrieve.mockReset().mockResolvedValue(scheduleObject());
  schedUpdate.mockReset().mockResolvedValue({});
  schedRelease.mockReset().mockResolvedValue({});
  pricesList.mockReset().mockResolvedValue({
    data: [
      stripePrice('price_big_m', BIG, 'monthly', 5000),
      stripePrice('price_big_y', BIG, 'yearly', 48000),
      stripePrice('price_small_m', SMALL, 'monthly', 2000),
      stripePrice('price_small_y', SMALL, 'yearly', 19200),
    ],
  });
  pricesCreate.mockReset().mockResolvedValue({ id: 'price_cree' });
  pricesUpdate.mockReset().mockResolvedValue({});
  productsList.mockReset().mockResolvedValue({ data: [{ id: 'prod_x', metadata: { planId: BIG } }] });
  productsCreate.mockReset().mockResolvedValue({ id: 'prod_cree' });
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
  await prisma.user.deleteMany({ where: { cabinetId: { in: ids } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.pricingPlan.deleteMany({ where: { planId: { in: [BIG, SMALL] } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

describe('quotaBlockers (D15)', () => {
  const usage = (users: number) => ({
    limits: null,
    utilisateurs: { members: users, pendingInvitations: 0, used: users },
    entreprises: { used: 0 },
    storageMb: { used: 0 },
  });

  it('refuse quand la consommation DEPASSE la limite du plan vise', () => {
    expect(
      quotaBlockers(usage(12), { maxEntreprises: 25, maxUtilisateurs: 10, maxStorageMb: 5120 }),
    ).toEqual([{ quota: 'maxUtilisateurs', used: 12, limit: 10 }]);
  });

  it('accepte d etre exactement a la limite, et une limite nulle (illimite)', () => {
    expect(
      quotaBlockers(usage(10), { maxEntreprises: null, maxUtilisateurs: 10, maxStorageMb: null }),
    ).toEqual([]);
    expect(
      quotaBlockers(usage(500), { maxEntreprises: null, maxUtilisateurs: null, maxStorageMb: null }),
    ).toEqual([]);
  });
});

describe('getPlanChangeOptions', () => {
  it('liste les plans avec prix et signale ceux que la consommation interdit', async () => {
    const cabinet = await createCabinet();
    await addMember(cabinet.id, 3);

    const options = await getPlanChangeOptions(cabinet.id);

    expect(options).toMatchObject({ currentPlanId: BIG, currentPeriod: 'monthly', canChange: true });
    const big = options.plans.find((p) => p.planId === BIG)!;
    const small = options.plans.find((p) => p.planId === SMALL)!;
    expect(big).toMatchObject({ isCurrentPlan: true, monthlyCents: 5000, yearlyCents: 48000, blockers: [] });
    expect(small.monthlyCents).toBe(2000);
    expect(small.blockers).toEqual([{ quota: 'maxUtilisateurs', used: 3, limit: 1 }]);
  });

  it.each([
    ['IMPAYE', 'STATE'],
    ['DELAI_GRACE', 'STATE'],
    ['RESILIE', 'STATE'],
  ])('interdit le changement en %s', async (billingStatus, reason) => {
    const cabinet = await createCabinet({ billingStatus });
    expect(await getPlanChangeOptions(cabinet.id)).toMatchObject({ canChange: false, reason });
  });

  it('interdit le changement quand une resiliation est programmee', async () => {
    const cabinet = await createCabinet({ cancelAtPeriodEnd: true });
    expect(await getPlanChangeOptions(cabinet.id)).toMatchObject({
      canChange: false,
      reason: 'CANCELLING',
    });
  });
});

describe('schedulePlanChange (D60)', () => {
  it('programme le nouveau plan pour la fin de periode, sans prorata, et l audite', async () => {
    const cabinet = await createCabinet();

    const result = await schedulePlanChange(cabinet.id, actorId, { planId: SMALL, billingPeriod: 'monthly' });

    expect(result).toEqual({ ok: true, effectiveAt: new Date(PERIOD_END * 1000) });
    expect(schedCreate).toHaveBeenCalledWith({ from_subscription: 'sub_pc' });
    const update = schedUpdate.mock.calls[0][1];
    expect(update.proration_behavior).toBe('none');
    expect(update.end_behavior).toBe('release');
    // Phase 1 : le plan actuel jusqu'au terme ; phase 2 : le plan vise.
    expect(update.phases[0]).toMatchObject({
      items: [{ price: 'price_big_m', quantity: 1 }],
      end_date: PERIOD_END,
    });
    expect(update.phases[1]).toEqual({ items: [{ price: 'price_small_m', quantity: 1 }] });
    // Rien ne change tout de suite localement : le plan suit Stripe par webhook.
    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } })).planId).toBe(BIG);
    expect(await audits(cabinet.id)).toEqual(['PLAN_CHANGE_SCHEDULED']);
    // D75 : le plan vise est memorise pour reserver ses quotas des maintenant.
    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } })).pendingPlanId).toBe(SMALL);
  });

  it('ne reserve rien quand seule la periodicite change, et libere une reservation precedente (D75)', async () => {
    const cabinet = await createCabinet();
    await schedulePlanChange(cabinet.id, actorId, { planId: SMALL, billingPeriod: 'monthly' });
    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } })).pendingPlanId).toBe(SMALL);

    // Nouveau choix qui remplace le precedent : meme plan, autre periodicite.
    await schedulePlanChange(cabinet.id, actorId, { planId: BIG, billingPeriod: 'yearly' });

    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } })).pendingPlanId).toBeNull();
  });

  it('change aussi la periodicite d un meme plan (mensuel vers annuel)', async () => {
    const cabinet = await createCabinet();

    const result = await schedulePlanChange(cabinet.id, actorId, { planId: BIG, billingPeriod: 'yearly' });

    expect(result.ok).toBe(true);
    expect(schedUpdate.mock.calls[0][1].phases[1]).toEqual({
      items: [{ price: 'price_big_y', quantity: 1 }],
    });
  });

  it('conserve la fin d essai dans la premiere phase', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ESSAI' });
    schedCreate.mockResolvedValue(
      scheduleObject({ phases: [{ start_date: NOW, end_date: PERIOD_END, trial_end: PERIOD_END }] }),
    );

    await schedulePlanChange(cabinet.id, actorId, { planId: SMALL, billingPeriod: 'monthly' });

    expect(schedUpdate.mock.calls[0][1].phases[0].trial_end).toBe(PERIOD_END);
  });

  it('remplace un changement deja programme au lieu d en creer un second', async () => {
    const cabinet = await createCabinet();
    subsList.mockResolvedValue({ data: [subscription({ schedule: 'sub_sched_1' })] });

    await schedulePlanChange(cabinet.id, actorId, { planId: SMALL, billingPeriod: 'yearly' });

    expect(schedCreate).not.toHaveBeenCalled();
    expect(schedRetrieve).toHaveBeenCalledWith('sub_sched_1');
    expect(schedUpdate.mock.calls[0][0]).toBe('sub_sched_1');
  });

  it('refuse un plan qui depasse la consommation, en indiquant quoi reduire', async () => {
    const cabinet = await createCabinet();
    await addMember(cabinet.id, 3);

    const result = await schedulePlanChange(cabinet.id, actorId, { planId: SMALL, billingPeriod: 'monthly' });

    expect(result).toEqual({
      ok: false,
      error: 'QUOTA_EXCEEDED',
      blockers: [{ quota: 'maxUtilisateurs', used: 3, limit: 1 }],
    });
    expect(schedUpdate).not.toHaveBeenCalled();
    expect(await audits(cabinet.id)).toEqual([]);
  });

  it('compte les invitations en attente dans la consommation (D56)', async () => {
    const cabinet = await createCabinet();
    await addMember(cabinet.id, 1);
    await prisma.invitation.create({
      data: {
        email: `${TEST_EMAIL_PREFIX}pc-inv-${stamp}@socialflow.page`,
        role: 'GESTIONNAIRE_RH',
        status: 'pending',
        tokenHash: `hash-${stamp}-${cabinet.id}`,
        expiresAt: new Date(Date.now() + 86_400_000),
        cabinetId: cabinet.id,
        invitedById: actorId,
      },
    });

    const result = await schedulePlanChange(cabinet.id, actorId, { planId: SMALL, billingPeriod: 'monthly' });

    expect(result).toMatchObject({ ok: false, error: 'QUOTA_EXCEEDED' });
  });

  it('refuse le meme plan et la meme periodicite', async () => {
    const cabinet = await createCabinet();
    expect(await schedulePlanChange(cabinet.id, actorId, { planId: BIG, billingPeriod: 'monthly' })).toEqual({
      ok: false,
      error: 'SAME_PLAN',
    });
  });

  it.each(['DELAI_GRACE', 'IMPAYE', 'RESILIE', 'EN_ATTENTE_PAIEMENT'])(
    'refuse un changement en %s : on regularise d abord',
    async (billingStatus) => {
      const cabinet = await createCabinet({ billingStatus });
      expect(
        await schedulePlanChange(cabinet.id, actorId, { planId: SMALL, billingPeriod: 'monthly' }),
      ).toEqual({ ok: false, error: 'PLAN_CHANGE_NOT_ALLOWED' });
    },
  );

  it('refuse tant qu une resiliation est programmee', async () => {
    const cabinet = await createCabinet({ cancelAtPeriodEnd: true });
    expect(
      await schedulePlanChange(cabinet.id, actorId, { planId: SMALL, billingPeriod: 'monthly' }),
    ).toEqual({ ok: false, error: 'RESUME_FIRST' });
  });

  it('refuse un plan inconnu ou archive', async () => {
    const cabinet = await createCabinet();
    expect(
      await schedulePlanChange(cabinet.id, actorId, { planId: `fantome-${stamp}`, billingPeriod: 'monthly' }),
    ).toEqual({ ok: false, error: 'PLAN_UNAVAILABLE' });

    await prisma.pricingPlan.update({ where: { planId: SMALL }, data: { archivedAt: new Date() } });
    try {
      expect(
        await schedulePlanChange(cabinet.id, actorId, { planId: SMALL, billingPeriod: 'monthly' }),
      ).toEqual({ ok: false, error: 'PLAN_UNAVAILABLE' });
    } finally {
      await prisma.pricingPlan.update({ where: { planId: SMALL }, data: { archivedAt: null } });
    }
  });

  it('refuse une periodicite sans prix en base (D58)', async () => {
    const cabinet = await createCabinet();
    await prisma.pricingPlan.update({ where: { planId: SMALL }, data: { yearlyPrice: null } });
    try {
      expect(
        await schedulePlanChange(cabinet.id, actorId, { planId: SMALL, billingPeriod: 'yearly' }),
      ).toEqual({ ok: false, error: 'PRICE_NOT_SET' });
    } finally {
      await prisma.pricingPlan.update({ where: { planId: SMALL }, data: { yearlyPrice: 16 } });
    }
  });

  it('signale un echec de Stripe sans rien auditer', async () => {
    const cabinet = await createCabinet();
    schedUpdate.mockRejectedValue(new Error('stripe down sk_test_secret'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(
      await schedulePlanChange(cabinet.id, actorId, { planId: SMALL, billingPeriod: 'monthly' }),
    ).toEqual({ ok: false, error: 'STRIPE_FAILED' });
    expect(await audits(cabinet.id)).toEqual([]);
  });
});

describe('changement programme : lecture et annulation', () => {
  it('lit la phase suivante du schedule comme changement en attente', async () => {
    const cabinet = await createCabinet();
    subsList.mockResolvedValue({ data: [subscription({ schedule: 'sub_sched_1' })] });
    schedRetrieve.mockResolvedValue(
      scheduleObject({
        phases: [
          { start_date: NOW - 10 * DAY, end_date: PERIOD_END, items: [] },
          {
            start_date: PERIOD_END,
            items: [{ price: stripePrice('price_small_y', SMALL, 'yearly', 19200) }],
          },
        ],
      }),
    );

    const pending = await getPendingPlanChange(cabinet.stripeCustomerId!);

    expect(pending).toEqual({
      planId: SMALL,
      planName: 'Plan Petit',
      billingPeriod: 'yearly',
      effectiveAt: new Date(PERIOD_END * 1000),
      amountCents: 19200,
    });
  });

  it('renvoie null sans schedule', async () => {
    const cabinet = await createCabinet();
    expect(await getPendingPlanChange(cabinet.stripeCustomerId!)).toBeNull();
  });

  it('annule un changement programme, libere les quotas reserves et l audite', async () => {
    const cabinet = await createCabinet();
    await prisma.cabinet.update({ where: { id: cabinet.id }, data: { pendingPlanId: SMALL } });
    subsList.mockResolvedValue({ data: [subscription({ schedule: 'sub_sched_1' })] });

    expect(await cancelPlanChange(cabinet.id, actorId)).toEqual({ ok: true });

    expect(schedRelease).toHaveBeenCalledWith('sub_sched_1');
    expect(await audits(cabinet.id)).toEqual(['PLAN_CHANGE_CANCELLED']);
    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } })).pendingPlanId).toBeNull();
  });

  it('refuse d annuler quand rien n est programme', async () => {
    const cabinet = await createCabinet();
    expect(await cancelPlanChange(cabinet.id, actorId)).toEqual({
      ok: false,
      error: 'NO_PENDING_CHANGE',
    });
    expect(schedRelease).not.toHaveBeenCalled();
  });
});

describe('routes /api/billing/plan-change', () => {
  async function creerCabinetRH(label: string) {
    const mail = testEmail(label);
    const cj = cookieJar();
    cj.apply(
      await auth.api.signUpEmail({
        body: { name: 'Titulaire Plan', email: mail, password: PASSWORD },
        asResponse: true,
      }),
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    await prisma.cabinet.update({
      where: { id: user.cabinetId! },
      data: {
        stripeCustomerId: `cus_route_pc_${stamp}_${++counter}`,
        planId: BIG,
        billingPeriod: 'monthly',
        billingStatus: 'ACTIF',
      },
    });
    return { cj, user };
  }

  function post(url: string, cj?: ReturnType<typeof cookieJar>, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const cookie = cj?.headers().get('cookie');
    if (cookie) headers.cookie = cookie;
    return new Request(`${APP_URL}${url}`, {
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it('refuse sans session et pour un autre role', async () => {
    expect((await changeRoute(post('/api/billing/plan-change'))).status).toBe(401);

    const { cj, user } = await creerCabinetRH('pc-role');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'GESTIONNAIRE_RH' } });
    expect((await changeRoute(post('/api/billing/plan-change', cj, { planId: SMALL, billingPeriod: 'monthly' }))).status).toBe(403);
    expect((await cancelRoute(post('/api/billing/plan-change/cancel', cj))).status).toBe(403);
    expect(schedUpdate).not.toHaveBeenCalled();
  });

  it('valide le corps de la requete', async () => {
    const { cj } = await creerCabinetRH('pc-valid');

    const res = await changeRoute(post('/api/billing/plan-change', cj, { planId: SMALL, billingPeriod: 'weekly' }));
    expect(res.status).toBe(400);
    const res2 = await changeRoute(post('/api/billing/plan-change', cj, {}));
    expect(res2.status).toBe(400);
  });

  it('programme le changement du cabinet de la session', async () => {
    const { cj, user } = await creerCabinetRH('pc-ok');

    const res = await changeRoute(post('/api/billing/plan-change', cj, { planId: SMALL, billingPeriod: 'monthly' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, effectiveAt: new Date(PERIOD_END * 1000).toISOString() });
    expect(await audits(user.cabinetId!)).toContain('PLAN_CHANGE_SCHEDULED');
  });

  it('renvoie 403 QUOTA_EXCEEDED avec ce qu il faut reduire', async () => {
    const { cj, user } = await creerCabinetRH('pc-quota');
    await addMember(user.cabinetId!, 2);

    const res = await changeRoute(post('/api/billing/plan-change', cj, { planId: SMALL, billingPeriod: 'monthly' }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('QUOTA_EXCEEDED');
    expect(body.blockers).toEqual([{ quota: 'maxUtilisateurs', used: 2, limit: 1 }]);
  });
});
