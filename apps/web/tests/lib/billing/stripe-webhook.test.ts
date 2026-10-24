// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { TEST_EMAIL_PREFIX } from '../../helpers/auth-test-utils';

const WEBHOOK_SECRET = 'whsec_test_secret_for_vitest';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

vi.mock('@/lib/email/email', () => ({
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { prisma } = await import('@/lib/prisma');
const { supprimerCabinetsEtDonnees } = await import('@/lib/cabinet/cabinet-purge');
const { stripe } = await import('@/lib/billing/stripe');
const email = await import('@/lib/email/email');
const { POST } = await import('@/app/api/webhooks/stripe/route');

const stamp = Date.now();
const cabinetIds: string[] = [];
let counter = 0;

const NOW = Math.floor(Date.now() / 1000);
const DAY = 24 * 60 * 60;

async function createCabinet(data: {
  billingStatus?: string;
  status?: string;
  billingEventAt?: Date | null;
  pastDueSince?: Date | null;
  planId?: string | null;
  pendingPlanId?: string | null;
  currentPeriodEnd?: Date | null;
} = {}) {
  counter += 1;
  const cabinet = await prisma.cabinet.create({
    data: {
      name: `webhook-test-${stamp}-${counter}`,
      stripeCustomerId: `cus_wh_${stamp}_${counter}`,
      ...data,
    },
  });
  cabinetIds.push(cabinet.id);
  return cabinet as typeof cabinet & { stripeCustomerId: string };
}

async function createOwner(cabinetId: string) {
  counter += 1;
  return prisma.user.create({
    data: {
      id: `webhook-owner-${stamp}-${counter}`,
      name: 'Titulaire Test',
      email: `${TEST_EMAIL_PREFIX}webhook-${stamp}-${counter}@example.com`,
      role: 'CABINET_RH',
      cabinetId,
    },
  });
}

function makeEvent(type: string, object: Record<string, unknown>, created = NOW) {
  counter += 1;
  return { id: `evt_wh_${stamp}_${counter}`, object: 'event', type, created, data: { object } };
}

function send(event: object, options: { sign?: boolean; signature?: string } = {}) {
  const payload = JSON.stringify(event);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.signature) headers['stripe-signature'] = options.signature;
  else if (options.sign !== false) {
    headers['stripe-signature'] = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
  }
  return POST(
    new Request('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers,
      body: payload,
    }),
  );
}

const subscription = (customer: string, status: string, extra: Record<string, unknown> = {}) => ({
  id: 'sub_test',
  object: 'subscription',
  customer,
  status,
  metadata: {},
  trial_end: null,
  items: { data: [{ current_period_end: NOW + 30 * DAY, price: { metadata: {} } }] },
  ...extra,
});

const stateOf = (id: string) =>
  prisma.cabinet.findUniqueOrThrow({
    where: { id },
    select: {
      billingStatus: true,
      pastDueSince: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      planId: true,
      pendingPlanId: true,
      billingPeriod: true,
      cancelAtPeriodEnd: true,
      status: true,
    },
  });

beforeEach(() => {
  vi.mocked(email.sendPaymentFailedEmail).mockClear();
});

const adminIds: string[] = [];

// Une base vide (CI) n'a aucun SuperAdmin : le test crée le sien au lieu de dépendre de
// celui de la base de développement.
async function createSuperAdmin() {
  counter += 1;
  const admin = await prisma.user.create({
    data: {
      id: `webhook-admin-${stamp}-${counter}`,
      name: 'SuperAdmin Test',
      email: `${TEST_EMAIL_PREFIX}webhook-admin-${stamp}-${counter}@example.com`,
      role: 'SUPER_ADMIN',
    },
  });
  adminIds.push(admin.id);
  return admin;
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: adminIds } } });
  await prisma.webhookEvent.deleteMany({ where: { eventId: { startsWith: `evt_wh_${stamp}` } } });
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await supprimerCabinetsEtDonnees(cabinetIds);
});

describe('securite du webhook', () => {
  it('refuse une requete sans signature ou avec une signature invalide', async () => {
    const event = makeEvent('invoice.paid', { customer: 'cus_x', amount_paid: 100 });

    const sans = await send(event, { sign: false });
    expect(sans.status).toBe(400);
    expect(await sans.json()).toEqual({ error: 'INVALID_SIGNATURE' });

    const fausse = await send(event, { signature: 't=1,v1=deadbeef' });
    expect(fausse.status).toBe(400);
  });

  it('refuse une signature calculee avec un autre secret', async () => {
    const event = makeEvent('invoice.paid', { customer: 'cus_x', amount_paid: 100 });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: JSON.stringify(event),
      secret: 'whsec_un_autre_secret',
    });
    expect((await send(event, { signature })).status).toBe(400);
  });

  it('ne traite rien sans secret configure', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      const res = await send(makeEvent('invoice.paid', {}), { sign: false });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'WEBHOOK_NOT_CONFIGURED' });
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    }
  });

  it('accuse reception d un client inconnu sans rien modifier', async () => {
    const res = await send(
      makeEvent('customer.subscription.updated', subscription('cus_inconnu', 'active')),
    );
    expect(res.status).toBe(200);
  });
});

describe('suivi de l abonnement', () => {
  it('passe en essai avec la fin d essai et la fin de periode de Stripe', async () => {
    const cabinet = await createCabinet({ billingStatus: 'EN_ATTENTE_PAIEMENT' });
    const trialEnd = NOW + 30 * DAY;

    const res = await send(
      makeEvent(
        'customer.subscription.updated',
        subscription(cabinet.stripeCustomerId, 'trialing', { trial_end: trialEnd }),
      ),
    );
    expect(res.status).toBe(200);

    const state = await stateOf(cabinet.id);
    expect(state.billingStatus).toBe('ESSAI');
    expect(state.trialEndsAt?.getTime()).toBe(trialEnd * 1000);
    expect(state.currentPeriodEnd?.getTime()).toBe((NOW + 30 * DAY) * 1000);
  });

  it('passe en actif et reprend le plan et la periode du prix Stripe', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ESSAI' });

    await send(
      makeEvent(
        'customer.subscription.updated',
        subscription(cabinet.stripeCustomerId, 'active', {
          items: {
            data: [
              {
                current_period_end: NOW + 365 * DAY,
                price: { metadata: { planId: 'pro', billingPeriod: 'yearly' } },
              },
            ],
          },
        }),
      ),
    );

    const state = await stateOf(cabinet.id);
    expect(state.billingStatus).toBe('ACTIF');
    expect(state.planId).toBe('pro');
    expect(state.billingPeriod).toBe('yearly');
  });

  it('un changement programme applique par Stripe efface le plan en attente (D75)', async () => {
    const cabinet = await createCabinet({
      billingStatus: 'ACTIF',
      planId: 'pro',
      pendingPlanId: 'starter',
      currentPeriodEnd: new Date((NOW + DAY) * 1000),
    });

    await send(
      makeEvent(
        'customer.subscription.updated',
        subscription(cabinet.stripeCustomerId, 'active', {
          items: {
            data: [{ current_period_end: NOW + 31 * DAY, price: { metadata: { planId: 'starter', billingPeriod: 'monthly' } } }],
          },
        }),
      ),
    );

    const state = await stateOf(cabinet.id);
    expect(state.planId).toBe('starter');
    expect(state.pendingPlanId).toBeNull();
  });

  it('garde le plan en attente tant que la periode n est pas renouvelee (D75)', async () => {
    const cabinet = await createCabinet({
      billingStatus: 'ACTIF',
      planId: 'pro',
      pendingPlanId: 'starter',
      currentPeriodEnd: new Date((NOW + 30 * DAY) * 1000),
    });

    // Evenement sans rapport (resiliation reprise) : meme plan, meme periode.
    await send(
      makeEvent(
        'customer.subscription.updated',
        subscription(cabinet.stripeCustomerId, 'active', {
          cancel_at_period_end: false,
          items: { data: [{ current_period_end: NOW + 30 * DAY, price: { metadata: { planId: 'pro' } } }] },
        }),
      ),
    );

    expect((await stateOf(cabinet.id)).pendingPlanId).toBe('starter');
  });

  it('efface le plan en attente quand la periode est renouvelee sans le changement (D75)', async () => {
    const cabinet = await createCabinet({
      billingStatus: 'ACTIF',
      planId: 'pro',
      pendingPlanId: 'starter',
      currentPeriodEnd: new Date((NOW + DAY) * 1000),
    });

    // Renouvellement au meme plan : le changement a ete libere cote Stripe.
    await send(
      makeEvent(
        'customer.subscription.updated',
        subscription(cabinet.stripeCustomerId, 'active', {
          items: { data: [{ current_period_end: NOW + 31 * DAY, price: { metadata: { planId: 'pro' } } }] },
        }),
      ),
    );

    const state = await stateOf(cabinet.id);
    expect(state.planId).toBe('pro');
    expect(state.pendingPlanId).toBeNull();
  });

  it('suit la resiliation programmee et sa reprise depuis Stripe (D59)', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF' });

    await send(
      makeEvent(
        'customer.subscription.updated',
        subscription(cabinet.stripeCustomerId, 'active', { cancel_at_period_end: true }),
      ),
    );
    expect((await stateOf(cabinet.id)).cancelAtPeriodEnd).toBe(true);
    expect((await stateOf(cabinet.id)).billingStatus).toBe('ACTIF');

    await send(
      makeEvent(
        'customer.subscription.updated',
        subscription(cabinet.stripeCustomerId, 'active', { cancel_at_period_end: false }),
        NOW + 60,
      ),
    );
    expect((await stateOf(cabinet.id)).cancelAtPeriodEnd).toBe(false);
  });

  it('ignore un plan inconnu du catalogue', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ESSAI' });

    await send(
      makeEvent(
        'customer.subscription.updated',
        subscription(cabinet.stripeCustomerId, 'active', {
          items: {
            data: [{ current_period_end: NOW, price: { metadata: { planId: 'plan-fantome' } } }],
          },
        }),
      ),
    );

    expect((await stateOf(cabinet.id)).planId).toBeNull();
  });

  it('un paiement echoue ouvre le delai de grace, previent le titulaire et les SuperAdmins, et journalise', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF' });
    const owner = await createOwner(cabinet.id);
    await createSuperAdmin();

    const res = await send(
      makeEvent('invoice.payment_failed', { customer: cabinet.stripeCustomerId }),
    );
    expect(res.status).toBe(200);

    const state = await stateOf(cabinet.id);
    expect(state.billingStatus).toBe('DELAI_GRACE');
    expect(state.pastDueSince?.getTime()).toBe(NOW * 1000);

    const calls = vi.mocked(email.sendPaymentFailedEmail).mock.calls;
    const ownerCall = calls.find((c) => c[0] === owner.email);
    expect(ownerCall?.[2]).toBe(cabinet.name);
    expect(ownerCall?.[3].getTime()).toBe((NOW + 7 * DAY) * 1000);
    expect(ownerCall?.[4]).toBe('cabinet');
    expect(calls.some((c) => c[4] === 'admin')).toBe(true);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId: cabinet.id, action: 'BILLING_STATUS_CHANGED' },
    });
    expect(audit.metadata).toMatchObject({ from: 'ACTIF', to: 'DELAI_GRACE' });
  });

  it('ne previent qu une fois quand plusieurs evenements annoncent le meme impaye', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF' });
    await createOwner(cabinet.id);

    await send(makeEvent('invoice.payment_failed', { customer: cabinet.stripeCustomerId }, NOW));
    const afterFirst = vi.mocked(email.sendPaymentFailedEmail).mock.calls.length;

    await send(
      makeEvent(
        'customer.subscription.updated',
        subscription(cabinet.stripeCustomerId, 'past_due'),
        NOW + 5,
      ),
    );

    expect(vi.mocked(email.sendPaymentFailedEmail).mock.calls.length).toBe(afterFirst);
    // Le debut du delai n'est pas repousse par le second evenement.
    expect((await stateOf(cabinet.id)).pastDueSince?.getTime()).toBe(NOW * 1000);
  });

  it('la facture payee regularise un impaye et efface le delai de grace', async () => {
    const cabinet = await createCabinet({
      billingStatus: 'DELAI_GRACE',
      pastDueSince: new Date((NOW - 3 * DAY) * 1000),
    });

    await send(
      makeEvent('invoice.paid', { customer: cabinet.stripeCustomerId, amount_paid: 15000 }),
    );

    const state = await stateOf(cabinet.id);
    expect(state.billingStatus).toBe('ACTIF');
    expect(state.pastDueSince).toBeNull();
  });

  it('la facture a 0 EUR du debut d essai ne passe pas le cabinet en actif', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ESSAI' });

    await send(makeEvent('invoice.paid', { customer: cabinet.stripeCustomerId, amount_paid: 0 }));

    expect((await stateOf(cabinet.id)).billingStatus).toBe('ESSAI');
  });

  it('un paiement echoue ne ramene pas un cabinet impaye ou resilie en arriere', async () => {
    const impaye = await createCabinet({ billingStatus: 'IMPAYE' });
    const resilie = await createCabinet({ billingStatus: 'RESILIE' });

    await send(makeEvent('invoice.payment_failed', { customer: impaye.stripeCustomerId }));
    await send(makeEvent('invoice.payment_failed', { customer: resilie.stripeCustomerId }));

    expect((await stateOf(impaye.id)).billingStatus).toBe('IMPAYE');
    expect((await stateOf(resilie.id)).billingStatus).toBe('RESILIE');
  });

  it('la resiliation est definitive : un evenement tardif "actif" ne la defait pas', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF' });

    await send(
      makeEvent('customer.subscription.deleted', subscription(cabinet.stripeCustomerId, 'canceled'), NOW),
    );
    expect((await stateOf(cabinet.id)).billingStatus).toBe('RESILIE');

    await send(
      makeEvent(
        'customer.subscription.updated',
        subscription(cabinet.stripeCustomerId, 'active'),
        NOW + 10,
      ),
    );
    await send(
      makeEvent('invoice.paid', { customer: cabinet.stripeCustomerId, amount_paid: 100 }, NOW + 20),
    );
    expect((await stateOf(cabinet.id)).billingStatus).toBe('RESILIE');
  });

  it('ne touche jamais a la suspension manuelle du SuperAdmin', async () => {
    const cabinet = await createCabinet({ billingStatus: 'IMPAYE', status: 'suspendu' });

    await send(
      makeEvent('invoice.paid', { customer: cabinet.stripeCustomerId, amount_paid: 15000 }),
    );

    const state = await stateOf(cabinet.id);
    expect(state.billingStatus).toBe('ACTIF');
    expect(state.status).toBe('suspendu');
  });
});

describe('idempotence et ordre des evenements', () => {
  it('rejoue un evenement sans effet double', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF' });
    await createOwner(cabinet.id);
    const event = makeEvent('invoice.payment_failed', { customer: cabinet.stripeCustomerId });

    const first = await send(event);
    expect(await first.json()).toEqual({ received: true, duplicate: false });
    const emailsAfterFirst = vi.mocked(email.sendPaymentFailedEmail).mock.calls.length;

    const second = await send(event);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });

    expect(vi.mocked(email.sendPaymentFailedEmail).mock.calls.length).toBe(emailsAfterFirst);
    const audits = await prisma.auditLog.count({
      where: { cabinetId: cabinet.id, action: 'BILLING_STATUS_CHANGED' },
    });
    expect(audits).toBe(1);

    const stored = await prisma.webhookEvent.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(stored.processedAt).not.toBeNull();
  });

  it('reprend un evenement recu dont le traitement n avait pas abouti', async () => {
    const cabinet = await createCabinet({ billingStatus: 'ACTIF' });
    const event = makeEvent('invoice.payment_failed', { customer: cabinet.stripeCustomerId });
    await prisma.webhookEvent.create({ data: { eventId: event.id, type: event.type } });

    const res = await send(event);
    expect(await res.json()).toEqual({ received: true, duplicate: false });
    expect((await stateOf(cabinet.id)).billingStatus).toBe('DELAI_GRACE');
  });

  it('ignore un evenement plus ancien que le dernier applique', async () => {
    const cabinet = await createCabinet({
      billingStatus: 'ACTIF',
      billingEventAt: new Date((NOW + 100) * 1000),
    });

    await send(
      makeEvent('invoice.payment_failed', { customer: cabinet.stripeCustomerId }, NOW),
    );

    expect((await stateOf(cabinet.id)).billingStatus).toBe('ACTIF');
  });
});
