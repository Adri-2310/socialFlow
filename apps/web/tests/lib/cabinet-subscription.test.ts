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
const subsUpdate = vi.fn();
const sessionsCreate = vi.fn();
const sessionsRetrieve = vi.fn();
const customersRetrieve = vi.fn();
const customersUpdate = vi.fn();
const invoicesList = vi.fn();
const invoicesPay = vi.fn();
vi.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: { list: subsList, update: subsUpdate },
    checkout: { sessions: { create: sessionsCreate, retrieve: sessionsRetrieve } },
    customers: { retrieve: customersRetrieve, update: customersUpdate },
    invoices: { list: invoicesList, pay: invoicesPay },
  },
}));

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const {
  scheduleCancellation,
  resumeSubscription,
  createCardUpdateSession,
  confirmCardUpdate,
  getBillingExtras,
} = await import('@/lib/cabinet-subscription');
const { POST: cardRoute } = await import('@/app/api/billing/card/route');
const { POST: cancelRoute } = await import('@/app/api/billing/subscription/cancel/route');
const { POST: resumeRoute } = await import('@/app/api/billing/subscription/resume/route');

const APP_URL = 'http://localhost:3000';
const PASSWORD = 'InitialPass123!';
const stamp = Date.now();
const cabinetIds: string[] = [];
let counter = 0;

process.env.NEXT_PUBLIC_APP_URL = APP_URL;

async function createCabinet(data: Record<string, unknown> = {}) {
  counter += 1;
  const cabinet = await prisma.cabinet.create({
    data: {
      name: `subscription-test-${stamp}-${counter}`,
      stripeCustomerId: `cus_sub_${stamp}_${counter}`,
      ...data,
    },
  });
  cabinetIds.push(cabinet.id);
  return cabinet;
}

const liveSubscription = (extra: Record<string, unknown> = {}) => ({
  id: 'sub_live',
  status: 'active',
  cancel_at_period_end: false,
  ...extra,
});

const setupSession = (customer: string, extra: Record<string, unknown> = {}) => ({
  id: 'cs_test_setup1',
  mode: 'setup',
  status: 'complete',
  customer,
  setup_intent: { payment_method: 'pm_nouvelle' },
  ...extra,
});

// Acteur reel : AuditLog.actorId est une cle etrangere vers User.
let actorId = '';

beforeAll(async () => {
  const mail = testEmail('sub-acteur');
  await auth.api.signUpEmail({
    body: { name: 'Acteur Abonnement', email: mail, password: PASSWORD },
  });
  actorId = (await prisma.user.findUniqueOrThrow({ where: { email: mail } })).id;
});

beforeEach(() => {
  subsList.mockReset().mockResolvedValue({ data: [liveSubscription()] });
  subsUpdate.mockReset().mockResolvedValue({});
  sessionsCreate.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_setup' });
  sessionsRetrieve.mockReset();
  customersRetrieve.mockReset().mockResolvedValue({ invoice_settings: { default_payment_method: 'pm_ancienne' } });
  customersUpdate.mockReset().mockResolvedValue({});
  invoicesList.mockReset().mockResolvedValue({ data: [] });
  invoicesPay.mockReset().mockResolvedValue({});
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

const auditActions = async (cabinetId: string) =>
  (await prisma.auditLog.findMany({ where: { cabinetId }, select: { action: true } })).map(
    (a) => a.action,
  );

describe('resiliation et reprise (D59)', () => {
  it('programme la resiliation en fin de periode et l audite', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF' });

    expect(await scheduleCancellation(cabinet.id, actorId)).toEqual({ ok: true });

    expect(subsUpdate).toHaveBeenCalledWith('sub_live', { cancel_at_period_end: true });
    const state = await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } });
    expect(state.cancelAtPeriodEnd).toBe(true);
    // Aucun changement d'etat : l'acces reste ouvert jusqu'au terme.
    expect(state.billingStatus).toBe('ACTIF');
    expect(await auditActions(cabinet.id)).toEqual(['SUBSCRIPTION_CANCEL_SCHEDULED']);
  });

  it('refuse de resilier deux fois', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF' });
    subsList.mockResolvedValue({ data: [liveSubscription({ cancel_at_period_end: true })] });

    expect(await scheduleCancellation(cabinet.id, actorId)).toEqual({
      ok: false,
      error: 'ALREADY_CANCELLING',
    });
    expect(subsUpdate).not.toHaveBeenCalled();
  });

  it('reprend un abonnement dont la resiliation est programmee', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF', cancelAtPeriodEnd: true });
    subsList.mockResolvedValue({ data: [liveSubscription({ cancel_at_period_end: true })] });

    expect(await resumeSubscription(cabinet.id, actorId)).toEqual({ ok: true });

    expect(subsUpdate).toHaveBeenCalledWith('sub_live', { cancel_at_period_end: false });
    const state = await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } });
    expect(state.cancelAtPeriodEnd).toBe(false);
    expect(await auditActions(cabinet.id)).toEqual(['SUBSCRIPTION_CANCEL_REVERTED']);
  });

  it('refuse de reprendre quand aucune resiliation n est programmee', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF' });
    expect(await resumeSubscription(cabinet.id, actorId)).toEqual({
      ok: false,
      error: 'NOT_CANCELLING',
    });
  });

  it('refuse sans abonnement en cours ni client Stripe', async () => {
    const sansAbo = await createCabinet({ billingStatus: 'RESILIE' });
    subsList.mockResolvedValue({ data: [{ id: 'sub_old', status: 'canceled' }] });
    expect(await scheduleCancellation(sansAbo.id, actorId)).toEqual({
      ok: false,
      error: 'NO_SUBSCRIPTION',
    });

    const sansClient = await createCabinet({ stripeCustomerId: null });
    expect(await scheduleCancellation(sansClient.id, actorId)).toEqual({
      ok: false,
      error: 'NO_STRIPE_CUSTOMER',
    });
  });

  it('ne modifie rien en base quand Stripe echoue', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF' });
    subsUpdate.mockRejectedValue(new Error('stripe down sk_test_secret'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await scheduleCancellation(cabinet.id, actorId)).toEqual({
      ok: false,
      error: 'STRIPE_FAILED',
    });
    const state = await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } });
    expect(state.cancelAtPeriodEnd).toBe(false);
    expect(await auditActions(cabinet.id)).toEqual([]);
  });
});

describe('changement de carte (D59)', () => {
  it('ouvre une session Stripe en mode setup, carte seulement, retour sur Facturation', async () => {
    const cabinet = await createCabinet();

    const result = await createCardUpdateSession(cabinet.id, APP_URL);

    expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_setup' });
    const params = sessionsCreate.mock.calls[0][0];
    expect(params).toMatchObject({
      mode: 'setup',
      customer: cabinet.stripeCustomerId,
      payment_method_types: ['card'],
      client_reference_id: cabinet.id,
    });
    expect(params.success_url).toContain('/dashboard/cabinet/facturation?carte=ok&session_id=');
    expect(params.cancel_url).toBe(`${APP_URL}/dashboard/cabinet/facturation?carte=annulee`);
  });

  it('refuse un cabinet sans client Stripe', async () => {
    const cabinet = await createCabinet({ stripeCustomerId: null });
    expect(await createCardUpdateSession(cabinet.id, APP_URL)).toEqual({
      ok: false,
      error: 'NO_STRIPE_CUSTOMER',
    });
  });

  it('confirme : la nouvelle carte devient celle du client et de l abonnement', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF' });
    sessionsRetrieve.mockResolvedValue(setupSession(cabinet.stripeCustomerId!));

    expect(await confirmCardUpdate(cabinet.id, actorId, 'cs_test_setup1')).toEqual({
      ok: true,
      changed: true,
    });

    expect(customersUpdate).toHaveBeenCalledWith(cabinet.stripeCustomerId, {
      invoice_settings: { default_payment_method: 'pm_nouvelle' },
    });
    expect(subsUpdate).toHaveBeenCalledWith('sub_live', { default_payment_method: 'pm_nouvelle' });
    // En regle : pas de facture a representer.
    expect(invoicesPay).not.toHaveBeenCalled();
    expect(await auditActions(cabinet.id)).toEqual(['PAYMENT_METHOD_UPDATED']);
  });

  it('en retard de paiement, represente la facture ouverte avec la nouvelle carte', async () => {
    const cabinet = await createCabinet({ billingStatus: 'DELAI_GRACE' });
    sessionsRetrieve.mockResolvedValue(setupSession(cabinet.stripeCustomerId!));
    invoicesList.mockResolvedValue({ data: [{ id: 'in_ouverte' }] });

    await confirmCardUpdate(cabinet.id, actorId, 'cs_test_setup1');

    expect(invoicesPay).toHaveBeenCalledWith('in_ouverte', { payment_method: 'pm_nouvelle' });
  });

  it('garde le changement de carte meme si le paiement de la facture echoue', async () => {
    const cabinet = await createCabinet({ billingStatus: 'IMPAYE' });
    sessionsRetrieve.mockResolvedValue(setupSession(cabinet.stripeCustomerId!));
    invoicesList.mockResolvedValue({ data: [{ id: 'in_ouverte' }] });
    invoicesPay.mockRejectedValue(new Error('card_declined'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await confirmCardUpdate(cabinet.id, actorId, 'cs_test_setup1')).toEqual({
      ok: true,
      changed: true,
    });
  });

  it('resynchronise l etat local depuis Stripe : delai de grace leve si l abonnement est sain', async () => {
    const cabinet = await createCabinet({
      billingStatus: 'DELAI_GRACE',
      pastDueSince: new Date(Date.now() - 2 * 86_400_000),
      billingEventAt: new Date(Date.now() - 2 * 86_400_000),
    });
    sessionsRetrieve.mockResolvedValue(setupSession(cabinet.stripeCustomerId!));
    const now = Math.floor(Date.now() / 1000);
    subsList.mockResolvedValue({
      data: [
        liveSubscription({
          object: 'subscription',
          customer: cabinet.stripeCustomerId,
          status: 'trialing',
          metadata: { cabinetId: cabinet.id },
          trial_end: now + 10 * 86_400,
          cancel_at_period_end: true,
          items: { data: [{ current_period_end: now + 10 * 86_400, price: { metadata: {} } }] },
        }),
      ],
    });

    await confirmCardUpdate(cabinet.id, actorId, 'cs_test_setup1');

    const state = await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } });
    expect(state.billingStatus).toBe('ESSAI');
    expect(state.pastDueSince).toBeNull();
    // La resiliation programmee chez Stripe est rapatriee en meme temps.
    expect(state.cancelAtPeriodEnd).toBe(true);
  });

  it('garde le delai de grace tant que Stripe considere l abonnement en retard', async () => {
    const cabinet = await createCabinet({
      billingStatus: 'DELAI_GRACE',
      pastDueSince: new Date(Date.now() - 86_400_000),
      billingEventAt: new Date(Date.now() - 86_400_000),
    });
    sessionsRetrieve.mockResolvedValue(setupSession(cabinet.stripeCustomerId!));
    subsList.mockResolvedValue({
      data: [
        liveSubscription({
          object: 'subscription',
          customer: cabinet.stripeCustomerId,
          status: 'past_due',
          metadata: { cabinetId: cabinet.id },
          items: { data: [{ current_period_end: 0, price: { metadata: {} } }] },
        }),
      ],
    });

    await confirmCardUpdate(cabinet.id, actorId, 'cs_test_setup1');

    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: cabinet.id } })).billingStatus).toBe(
      'DELAI_GRACE',
    );
  });

  it('est idempotent : rejouer la meme session ne change rien et n audite pas', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF' });
    sessionsRetrieve.mockResolvedValue(setupSession(cabinet.stripeCustomerId!));
    customersRetrieve.mockResolvedValue({ invoice_settings: { default_payment_method: 'pm_nouvelle' } });

    expect(await confirmCardUpdate(cabinet.id, actorId, 'cs_test_setup1')).toEqual({
      ok: true,
      changed: false,
    });
    expect(customersUpdate).not.toHaveBeenCalled();
    expect(await auditActions(cabinet.id)).toEqual([]);
  });

  it('traite la session d un autre cabinet comme introuvable', async () => {
    const mine = await createCabinet();
    sessionsRetrieve.mockResolvedValue(setupSession('cus_autre_cabinet'));

    expect(await confirmCardUpdate(mine.id, actorId, 'cs_test_setup1')).toEqual({
      ok: false,
      error: 'SESSION_NOT_FOUND',
    });
    expect(customersUpdate).not.toHaveBeenCalled();
  });

  it('refuse une session non terminee ou qui n est pas une saisie de carte', async () => {
    const cabinet = await createCabinet();

    sessionsRetrieve.mockResolvedValue(setupSession(cabinet.stripeCustomerId!, { status: 'open' }));
    expect(await confirmCardUpdate(cabinet.id, actorId, 'cs_test_setup1')).toEqual({
      ok: false,
      error: 'CARD_SETUP_NOT_COMPLETED',
    });

    sessionsRetrieve.mockResolvedValue(setupSession(cabinet.stripeCustomerId!, { mode: 'subscription' }));
    expect(await confirmCardUpdate(cabinet.id, actorId, 'cs_test_setup1')).toEqual({
      ok: false,
      error: 'SESSION_NOT_FOUND',
    });
  });

  it('ne supprime jamais une carte', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF' });
    sessionsRetrieve.mockResolvedValue(setupSession(cabinet.stripeCustomerId!));

    await confirmCardUpdate(cabinet.id, actorId, 'cs_test_setup1');

    const calls = JSON.stringify([...customersUpdate.mock.calls, ...subsUpdate.mock.calls]);
    expect(calls).not.toContain('detach');
  });
});

describe('getBillingExtras', () => {
  it('resume la carte par defaut et liste les factures hors brouillons', async () => {
    const cabinet = await createCabinet();
    customersRetrieve.mockResolvedValue({
      invoice_settings: {
        default_payment_method: { card: { brand: 'visa', last4: '4242', exp_month: 3, exp_year: 2034 } },
      },
    });
    invoicesList.mockResolvedValue({
      data: [
        { id: 'in_1', number: 'A-1', created: 1_700_000_000, total: 30000, currency: 'eur', status: 'paid', invoice_pdf: 'https://x/pdf' },
        { id: 'in_2', number: null, created: 1_700_100_000, total: 0, currency: 'eur', status: 'draft', invoice_pdf: null },
      ],
    });

    const extras = await getBillingExtras(cabinet.id);

    expect(extras.available).toBe(true);
    expect(extras.card).toEqual({ brand: 'visa', last4: '4242', expMonth: 3, expYear: 2034 });
    expect(extras.invoices).toHaveLength(1);
    expect(extras.invoices[0]).toMatchObject({ number: 'A-1', amountCents: 30000, status: 'paid' });
  });

  it('n appelle pas Stripe sans client, et signale une indisponibilite', async () => {
    const sansClient = await createCabinet({ stripeCustomerId: null });
    expect(await getBillingExtras(sansClient.id)).toEqual({ card: null, invoices: [], available: true });
    expect(customersRetrieve).not.toHaveBeenCalled();

    const cabinet = await createCabinet();
    customersRetrieve.mockRejectedValue(new Error('stripe down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getBillingExtras(cabinet.id)).toEqual({ card: null, invoices: [], available: false });
  });
});

describe('routes /api/billing', () => {
  async function creerCabinetRH(label: string) {
    const mail = testEmail(label);
    const cj = cookieJar();
    cj.apply(
      await auth.api.signUpEmail({
        body: { name: 'Titulaire Abonnement', email: mail, password: PASSWORD },
        asResponse: true,
      }),
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    await prisma.cabinet.update({
      where: { id: user.cabinetId! },
      data: { stripeCustomerId: `cus_route_${stamp}_${++counter}`, billingStatus: 'ACTIF' },
    });
    return { cj, user };
  }

  function post(url: string, cj?: ReturnType<typeof cookieJar>) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const cookie = cj?.headers().get('cookie');
    if (cookie) headers.cookie = cookie;
    return new Request(`${APP_URL}${url}`, { method: 'POST', headers });
  }

  it('refuse sans session', async () => {
    expect((await cardRoute(post('/api/billing/card'))).status).toBe(401);
    expect((await cancelRoute(post('/api/billing/subscription/cancel'))).status).toBe(401);
    expect((await resumeRoute(post('/api/billing/subscription/resume'))).status).toBe(401);
  });

  it('refuse un role autre que Cabinet RH', async () => {
    const { cj, user } = await creerCabinetRH('sub-role');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'GESTIONNAIRE_RH' } });

    expect((await cardRoute(post('/api/billing/card', cj))).status).toBe(403);
    expect((await cancelRoute(post('/api/billing/subscription/cancel', cj))).status).toBe(403);
    expect((await resumeRoute(post('/api/billing/subscription/resume', cj))).status).toBe(403);
    expect(subsUpdate).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('resilie puis reprend l abonnement du cabinet de la session', async () => {
    const { cj, user } = await creerCabinetRH('sub-cancel');

    const cancel = await cancelRoute(post('/api/billing/subscription/cancel', cj));
    expect(cancel.status).toBe(200);
    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: user.cabinetId! } })).cancelAtPeriodEnd).toBe(true);

    subsList.mockResolvedValue({ data: [liveSubscription({ cancel_at_period_end: true })] });
    const resume = await resumeRoute(post('/api/billing/subscription/resume', cj));
    expect(resume.status).toBe(200);
    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: user.cabinetId! } })).cancelAtPeriodEnd).toBe(false);
  });

  it('renvoie 409 pour une resiliation deja programmee', async () => {
    const { cj } = await creerCabinetRH('sub-deja');
    subsList.mockResolvedValue({ data: [liveSubscription({ cancel_at_period_end: true })] });

    const res = await cancelRoute(post('/api/billing/subscription/cancel', cj));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'ALREADY_CANCELLING' });
  });

  it('reste accessible en lecture seule pour changer de carte (D29, D57)', async () => {
    const { cj, user } = await creerCabinetRH('sub-impaye');
    await prisma.cabinet.update({ where: { id: user.cabinetId! }, data: { billingStatus: 'IMPAYE' } });

    const res = await cardRoute(post('/api/billing/card', cj));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_setup' });
  });
});
