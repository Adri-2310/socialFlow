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
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const stripePricesList = vi.fn();
const stripePricesUpdate = vi.fn().mockResolvedValue({});
const stripePricesCreate = vi.fn().mockResolvedValue({});
const stripeProductsList = vi.fn();
const stripeProductsUpdate = vi.fn().mockResolvedValue({});
const stripeProductsCreate = vi.fn().mockResolvedValue({ id: 'prod_nouveau' });
vi.mock('@/lib/stripe', () => ({
  stripe: {
    prices: { list: stripePricesList, update: stripePricesUpdate, create: stripePricesCreate },
    products: { list: stripeProductsList, update: stripeProductsUpdate, create: stripeProductsCreate },
  },
}));

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const { PATCH: patchPlan, DELETE: archivePlan, PUT: restorePlan } = await import('@/app/api/admin/plans/[id]/route');
const { POST: createPlan } = await import('@/app/api/admin/plans/route');

const PASSWORD = 'InitialPass123!';
const APP_URL = 'http://localhost:3000';
const TEST_PLAN_PREFIX = 'plan-test-';

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
  await prisma.auditLog.deleteMany({
    where: { action: { in: ['PRICING_PLAN_CREATED', 'PRICING_PLAN_UPDATED', 'PRICING_PLAN_ARCHIVED', 'PRICING_PLAN_RESTORED'] } },
  });
  await prisma.pricingPlan.deleteMany({ where: { planId: { startsWith: TEST_PLAN_PREFIX } } });
});

/** Cree un Cabinet RH (auto-inscription) et renvoie son cookie jar + son cabinetId. */
async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: 'Cabinet Admin Test', email: mail, password: PASSWORD }, asResponse: true }));
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { mail, cj, user };
}

/** Cree un compte puis le force au role SUPER_ADMIN (jamais pose par l'inscription elle-meme). */
async function creerSuperAdmin(label: string) {
  const { mail, cj, user } = await creerCabinetRH(label);
  const cabinetId = user.cabinetId!;
  await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN', cabinetId: null } });
  await prisma.cabinet.delete({ where: { id: cabinetId } });
  return { mail, cj, user };
}

/** Cree un PricingPlan jetable, independant des plans reels (starter/pro/enterprise). */
async function creerPlanTest(label: string) {
  return prisma.pricingPlan.create({
    data: {
      planId: `${TEST_PLAN_PREFIX}${label}`,
      name: `Plan test ${label}`,
      description: 'Plan cree pour les tests',
      monthlyPrice: 100,
      yearlyPrice: 80,
      features: ['Fonctionnalite 1'],
      sortOrder: 99,
    },
  });
}

function requestPATCH(url: string, body: unknown, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return new Request(url, { method: 'PATCH', headers, body: JSON.stringify(body) });
}

function patch(planId: string, body: unknown, cj?: ReturnType<typeof cookieJar>) {
  return patchPlan(requestPATCH(`${APP_URL}/api/admin/plans/${planId}`, body, cj), {
    params: Promise.resolve({ id: planId }),
  });
}

function requestNoBody(method: string, url: string, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = {};
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return new Request(url, { method, headers });
}

function archive(planId: string, cj?: ReturnType<typeof cookieJar>) {
  return archivePlan(requestNoBody('DELETE', `${APP_URL}/api/admin/plans/${planId}`, cj), {
    params: Promise.resolve({ id: planId }),
  });
}

function restore(planId: string, cj?: ReturnType<typeof cookieJar>) {
  return restorePlan(requestNoBody('PUT', `${APP_URL}/api/admin/plans/${planId}`, cj), {
    params: Promise.resolve({ id: planId }),
  });
}

function create(body: unknown, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return createPlan(new Request(`${APP_URL}/api/admin/plans`, { method: 'POST', headers, body: JSON.stringify(body) }));
}

const VALID_BODY = {
  name: 'Starter modifie',
  description: 'Description modifiee',
  monthlyPrice: 100,
  yearlyPrice: 80,
  badge: null,
  highlighted: false,
  sortOrder: 1,
  features: ['Feature A', 'Feature B'],
};

beforeEach(() => {
  stripePricesList.mockReset().mockResolvedValue({ data: [] });
  stripePricesUpdate.mockReset().mockResolvedValue({});
  stripePricesCreate.mockReset().mockResolvedValue({});
  stripeProductsList.mockReset().mockResolvedValue({ data: [] });
  stripeProductsUpdate.mockReset().mockResolvedValue({});
  stripeProductsCreate.mockReset().mockResolvedValue({ id: 'prod_nouveau' });
});

describe('PATCH /api/admin/plans/[id]', () => {
  it('refuse sans session', async () => {
    const plan = await creerPlanTest('sans-session');
    const res = await patch(plan.id, VALID_BODY);
    expect(res.status).toBe(401);
  });

  it('refuse a un role autre que SUPER_ADMIN', async () => {
    const { cj } = await creerCabinetRH('plan-non-admin');
    const plan = await creerPlanTest('non-admin');
    const res = await patch(plan.id, VALID_BODY, cj);
    expect(res.status).toBe(403);
  });

  it('refuse un corps invalide (nom vide)', async () => {
    const { cj } = await creerSuperAdmin('plan-corps-invalide');
    const plan = await creerPlanTest('corps-invalide');
    const res = await patch(plan.id, { ...VALID_BODY, name: '' }, cj);
    expect(res.status).toBe(400);
  });

  it('refuse une liste de fonctionnalites vide', async () => {
    const { cj } = await creerSuperAdmin('plan-features-vides');
    const plan = await creerPlanTest('features-vides');
    const res = await patch(plan.id, { ...VALID_BODY, features: ['   ', ''] }, cj);
    expect(res.status).toBe(400);
  });

  it('refuse un prix non entier', async () => {
    const { cj } = await creerSuperAdmin('plan-prix-non-entier');
    const plan = await creerPlanTest('prix-non-entier');
    const res = await patch(plan.id, { ...VALID_BODY, monthlyPrice: 49.5 }, cj);
    expect(res.status).toBe(400);
  });

  it('refuse un plan inexistant', async () => {
    const { cj } = await creerSuperAdmin('plan-inexistant');
    const res = await patch('id-qui-n-existe-pas', VALID_BODY, cj);
    expect(res.status).toBe(404);
  });

  it("met a jour les champs sans appeler Stripe quand les prix ne changent pas", async () => {
    const { cj, user } = await creerSuperAdmin('plan-sans-changement-prix');
    const plan = await creerPlanTest('sans-changement-prix');

    const res = await patch(plan.id, { ...VALID_BODY, monthlyPrice: plan.monthlyPrice, yearlyPrice: plan.yearlyPrice }, cj);
    expect(res.status).toBe(200);

    expect(stripePricesList).not.toHaveBeenCalled();
    expect(stripePricesCreate).not.toHaveBeenCalled();

    const updated = await prisma.pricingPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(updated.name).toBe('Starter modifie');
    expect(updated.features).toEqual(['Feature A', 'Feature B']);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'PRICING_PLAN_UPDATED', actorId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.actorId).toBe(user.id);
  });

  it('archive l ancien Price Stripe et en cree un nouveau quand le prix mensuel change', async () => {
    const { cj } = await creerSuperAdmin('plan-changement-prix');
    const plan = await creerPlanTest('changement-prix');

    stripePricesList.mockResolvedValue({
      data: [{ id: 'price_ancien', metadata: { planId: plan.planId, billingPeriod: 'monthly' }, unit_amount: 10000 }],
    });
    stripeProductsList.mockResolvedValue({ data: [{ id: 'prod_test', metadata: { planId: plan.planId } }] });

    const res = await patch(plan.id, { ...VALID_BODY, monthlyPrice: 200, yearlyPrice: plan.yearlyPrice }, cj);
    expect(res.status).toBe(200);

    expect(stripePricesUpdate).toHaveBeenCalledWith('price_ancien', { active: false });
    expect(stripePricesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        product: 'prod_test',
        unit_amount: 20000,
        recurring: { interval: 'month' },
        metadata: { planId: plan.planId, billingPeriod: 'monthly' },
      }),
    );

    const updated = await prisma.pricingPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(updated.monthlyPrice).toBe(200);
  });

  it('archive le Price Stripe existant sans en creer un nouveau quand le plan passe "sur devis"', async () => {
    const { cj } = await creerSuperAdmin('plan-passage-sur-devis');
    const plan = await creerPlanTest('passage-sur-devis');

    stripePricesList.mockResolvedValue({
      data: [{ id: 'price_a_desactiver', metadata: { planId: plan.planId, billingPeriod: 'monthly' }, unit_amount: 10000 }],
    });

    const res = await patch(plan.id, { ...VALID_BODY, monthlyPrice: null, yearlyPrice: plan.yearlyPrice }, cj);
    expect(res.status).toBe(200);

    expect(stripePricesUpdate).toHaveBeenCalledWith('price_a_desactiver', { active: false });
    expect(stripePricesCreate).not.toHaveBeenCalled();

    const updated = await prisma.pricingPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(updated.monthlyPrice).toBeNull();
  });

  it("renvoie une erreur et ne modifie pas la base si le produit Stripe est introuvable pour un nouveau prix", async () => {
    const { cj } = await creerSuperAdmin('plan-produit-introuvable');
    const plan = await creerPlanTest('produit-introuvable');

    stripePricesList.mockResolvedValue({ data: [] });
    stripeProductsList.mockResolvedValue({ data: [] });

    const res = await patch(plan.id, { ...VALID_BODY, monthlyPrice: 200, yearlyPrice: plan.yearlyPrice }, cj);
    expect(res.status).toBe(502);

    const unchanged = await prisma.pricingPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(unchanged.monthlyPrice).toBe(100);
    expect(unchanged.name).toBe(`Plan test produit-introuvable`);
  });

  it('refuse de modifier un plan archive', async () => {
    const { cj } = await creerSuperAdmin('plan-edit-archive');
    const plan = await creerPlanTest('edit-archive');
    await prisma.pricingPlan.update({ where: { id: plan.id }, data: { archivedAt: new Date() } });

    const res = await patch(plan.id, VALID_BODY, cj);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/plans', () => {
  const VALID_CREATE_BODY = {
    planId: `${TEST_PLAN_PREFIX}nouveau`,
    name: 'Nouveau plan',
    description: 'Un plan cree pour les tests',
    monthlyPrice: 50,
    yearlyPrice: 40,
    badge: null,
    highlighted: false,
    sortOrder: 5,
    features: ['Feature A'],
  };

  it('refuse sans session', async () => {
    const res = await create(VALID_CREATE_BODY);
    expect(res.status).toBe(401);
  });

  it('refuse a un role autre que SUPER_ADMIN', async () => {
    const { cj } = await creerCabinetRH('plan-create-non-admin');
    const res = await create(VALID_CREATE_BODY, cj);
    expect(res.status).toBe(403);
  });

  it('refuse un planId au mauvais format', async () => {
    const { cj } = await creerSuperAdmin('plan-create-format-invalide');
    const res = await create({ ...VALID_CREATE_BODY, planId: 'Plan Avec Espaces' }, cj);
    expect(res.status).toBe(400);
  });

  it('refuse un prix non entier a la creation', async () => {
    const { cj } = await creerSuperAdmin('plan-create-prix-non-entier');
    const res = await create({ ...VALID_CREATE_BODY, planId: `${TEST_PLAN_PREFIX}prix-non-entier`, monthlyPrice: 49.5 }, cj);
    expect(res.status).toBe(400);
  });

  it('refuse un planId deja utilise', async () => {
    const { cj } = await creerSuperAdmin('plan-create-deja-pris');
    const existing = await creerPlanTest('deja-pris');
    const res = await create({ ...VALID_CREATE_BODY, planId: existing.planId }, cj);
    expect(res.status).toBe(409);
  });

  it('cree le Product Stripe puis les deux Price avant d ecrire en base, et journalise', async () => {
    const { cj, user } = await creerSuperAdmin('plan-create-ok');

    const res = await create(VALID_CREATE_BODY, cj);
    expect(res.status).toBe(201);

    expect(stripeProductsCreate).toHaveBeenCalledWith({
      name: 'Nouveau plan',
      metadata: { planId: VALID_CREATE_BODY.planId },
    });
    expect(stripePricesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        product: 'prod_nouveau',
        unit_amount: 5000,
        recurring: { interval: 'month' },
        metadata: { planId: VALID_CREATE_BODY.planId, billingPeriod: 'monthly' },
      }),
    );
    expect(stripePricesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        product: 'prod_nouveau',
        unit_amount: 4000,
        recurring: { interval: 'year' },
        metadata: { planId: VALID_CREATE_BODY.planId, billingPeriod: 'yearly' },
      }),
    );

    const created = await prisma.pricingPlan.findUniqueOrThrow({ where: { planId: VALID_CREATE_BODY.planId } });
    expect(created.name).toBe('Nouveau plan');

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'PRICING_PLAN_CREATED', actorId: user.id },
    });
    expect(log.actorId).toBe(user.id);
  });

  it("n ecrit rien en base si la creation Stripe echoue", async () => {
    const { cj } = await creerSuperAdmin('plan-create-stripe-echoue');
    stripeProductsCreate.mockRejectedValueOnce(new Error('stripe indisponible'));

    const res = await create({ ...VALID_CREATE_BODY, planId: `${TEST_PLAN_PREFIX}echec-stripe` }, cj);
    expect(res.status).toBe(502);

    const plan = await prisma.pricingPlan.findUnique({ where: { planId: `${TEST_PLAN_PREFIX}echec-stripe` } });
    expect(plan).toBeNull();
  });
});

describe('DELETE /api/admin/plans/[id] (archivage)', () => {
  it('refuse sans session', async () => {
    const plan = await creerPlanTest('archive-sans-session');
    const res = await archive(plan.id);
    expect(res.status).toBe(401);
  });

  it('refuse a un role autre que SUPER_ADMIN', async () => {
    const { cj } = await creerCabinetRH('plan-archive-non-admin');
    const plan = await creerPlanTest('archive-non-admin');
    const res = await archive(plan.id, cj);
    expect(res.status).toBe(403);
  });

  it('refuse un plan deja archive', async () => {
    const { cj } = await creerSuperAdmin('plan-deja-archive');
    const plan = await creerPlanTest('deja-archive');
    await prisma.pricingPlan.update({ where: { id: plan.id }, data: { archivedAt: new Date() } });

    const res = await archive(plan.id, cj);
    expect(res.status).toBe(400);
  });

  it('desactive le Product et tous les Price Stripe du plan, marque archivedAt et journalise', async () => {
    const { cj, user } = await creerSuperAdmin('plan-archive-ok');
    const plan = await creerPlanTest('archive-ok');

    stripeProductsList.mockResolvedValue({ data: [{ id: 'prod_a_archiver', metadata: { planId: plan.planId } }] });
    stripePricesList.mockResolvedValue({
      data: [
        { id: 'price_m', metadata: { planId: plan.planId, billingPeriod: 'monthly' } },
        { id: 'price_y', metadata: { planId: plan.planId, billingPeriod: 'yearly' } },
      ],
    });

    const res = await archive(plan.id, cj);
    expect(res.status).toBe(200);

    expect(stripeProductsUpdate).toHaveBeenCalledWith('prod_a_archiver', { active: false });
    expect(stripePricesUpdate).toHaveBeenCalledWith('price_m', { active: false });
    expect(stripePricesUpdate).toHaveBeenCalledWith('price_y', { active: false });

    const updated = await prisma.pricingPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(updated.archivedAt).not.toBeNull();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'PRICING_PLAN_ARCHIVED', actorId: user.id },
    });
    expect(log.actorId).toBe(user.id);
  });
});

describe('PUT /api/admin/plans/[id] (restauration)', () => {
  it('refuse un plan qui n est pas archive', async () => {
    const { cj } = await creerSuperAdmin('plan-restore-pas-archive');
    const plan = await creerPlanTest('restore-pas-archive');

    const res = await restore(plan.id, cj);
    expect(res.status).toBe(400);
  });

  it('reactive le Product et les Price Stripe existants, efface archivedAt et journalise', async () => {
    const { cj, user } = await creerSuperAdmin('plan-restore-ok');
    const plan = await creerPlanTest('restore-ok');
    await prisma.pricingPlan.update({ where: { id: plan.id }, data: { archivedAt: new Date() } });

    stripeProductsList.mockResolvedValue({ data: [{ id: 'prod_a_restaurer', metadata: { planId: plan.planId } }] });
    stripePricesList.mockResolvedValue({
      data: [{ id: 'price_restaure', metadata: { planId: plan.planId, billingPeriod: 'monthly' } }],
    });

    const res = await restore(plan.id, cj);
    expect(res.status).toBe(200);

    expect(stripeProductsUpdate).toHaveBeenCalledWith('prod_a_restaurer', { active: true });
    expect(stripePricesUpdate).toHaveBeenCalledWith('price_restaure', { active: true });

    const updated = await prisma.pricingPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(updated.archivedAt).toBeNull();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'PRICING_PLAN_RESTORED', actorId: user.id },
    });
    expect(log.actorId).toBe(user.id);
  });
});
