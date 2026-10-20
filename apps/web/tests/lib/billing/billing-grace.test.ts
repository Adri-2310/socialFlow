// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { TEST_EMAIL_PREFIX } from '../../helpers/auth-test-utils';

vi.mock('@/lib/email/email', () => ({
  sendPaymentSuspensionEmail: vi.fn().mockResolvedValue(undefined),
}));

const { prisma } = await import('@/lib/prisma');
const email = await import('@/lib/email/email');
const { suspendOverdueCabinets } = await import('@/lib/billing/billing-grace');
const { GET } = await import('@/app/api/cron/suspend-overdue-cabinets/route');

const stamp = Date.now();
const cabinetIds: string[] = [];
let counter = 0;
const DAY = 24 * 60 * 60 * 1000;
const now = new Date();

async function createCabinet(data: {
  billingStatus: string;
  pastDueSince?: Date | null;
  status?: string;
  deletedAt?: Date | null;
}) {
  counter += 1;
  const cabinet = await prisma.cabinet.create({
    data: { name: `grace-test-${stamp}-${counter}`, ...data },
  });
  cabinetIds.push(cabinet.id);
  return cabinet;
}

async function createOwner(cabinetId: string) {
  counter += 1;
  return prisma.user.create({
    data: {
      id: `grace-owner-${stamp}-${counter}`,
      name: 'Titulaire Test',
      email: `${TEST_EMAIL_PREFIX}grace-${stamp}-${counter}@example.com`,
      role: 'CABINET_RH',
      cabinetId,
    },
  });
}

const stateOf = (id: string) =>
  prisma.cabinet.findUniqueOrThrow({
    where: { id },
    select: { billingStatus: true, pastDueSince: true, status: true },
  });

beforeEach(() => {
  vi.mocked(email.sendPaymentSuspensionEmail).mockClear();
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
});

describe('suspendOverdueCabinets (D57)', () => {
  it('passe en impaye un cabinet dont le delai de 7 jours est ecoule, previent et journalise', async () => {
    const cabinet = await createCabinet({
      billingStatus: 'DELAI_GRACE',
      pastDueSince: new Date(now.getTime() - 8 * DAY),
    });
    const owner = await createOwner(cabinet.id);

    const result = await suspendOverdueCabinets(now);

    expect(result.suspended).toContain(cabinet.id);
    expect((await stateOf(cabinet.id)).billingStatus).toBe('IMPAYE');

    const calls = vi.mocked(email.sendPaymentSuspensionEmail).mock.calls;
    const ownerCall = calls.find((c) => c[0] === owner.email);
    expect(ownerCall?.[2]).toBe(cabinet.name);
    expect(ownerCall?.[3]).toBe('cabinet');
    expect(calls.some((c) => c[3] === 'admin')).toBe(true);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId: cabinet.id, action: 'BILLING_STATUS_CHANGED' },
    });
    expect(audit.metadata).toMatchObject({ from: 'DELAI_GRACE', to: 'IMPAYE' });
  });

  it('laisse en delai de grace un cabinet dont le delai court encore', async () => {
    const cabinet = await createCabinet({
      billingStatus: 'DELAI_GRACE',
      pastDueSince: new Date(now.getTime() - 3 * DAY),
    });

    const result = await suspendOverdueCabinets(now);

    expect(result.suspended).not.toContain(cabinet.id);
    expect((await stateOf(cabinet.id)).billingStatus).toBe('DELAI_GRACE');
  });

  it('ne touche ni aux cabinets en regle, ni aux resilies, ni aux archives', async () => {
    const old = new Date(now.getTime() - 30 * DAY);
    const actif = await createCabinet({ billingStatus: 'ACTIF', pastDueSince: old });
    const resilie = await createCabinet({ billingStatus: 'RESILIE', pastDueSince: old });
    const archive = await createCabinet({
      billingStatus: 'DELAI_GRACE',
      pastDueSince: old,
      deletedAt: new Date(),
    });

    const result = await suspendOverdueCabinets(now);

    for (const c of [actif, resilie, archive]) {
      expect(result.suspended).not.toContain(c.id);
    }
    expect((await stateOf(actif.id)).billingStatus).toBe('ACTIF');
    expect((await stateOf(resilie.id)).billingStatus).toBe('RESILIE');
    expect((await stateOf(archive.id)).billingStatus).toBe('DELAI_GRACE');
  });

  it('ne modifie jamais la suspension manuelle du SuperAdmin', async () => {
    const cabinet = await createCabinet({
      billingStatus: 'DELAI_GRACE',
      pastDueSince: new Date(now.getTime() - 10 * DAY),
      status: 'suspendu',
    });

    await suspendOverdueCabinets(now);

    const state = await stateOf(cabinet.id);
    expect(state.billingStatus).toBe('IMPAYE');
    expect(state.status).toBe('suspendu');
  });

  it('est idempotent : un second passage ne change rien et n envoie rien', async () => {
    const cabinet = await createCabinet({
      billingStatus: 'DELAI_GRACE',
      pastDueSince: new Date(now.getTime() - 9 * DAY),
    });
    await createOwner(cabinet.id);

    await suspendOverdueCabinets(now);
    const emailsAfterFirst = vi.mocked(email.sendPaymentSuspensionEmail).mock.calls.length;

    const second = await suspendOverdueCabinets(now);

    expect(second.suspended).not.toContain(cabinet.id);
    expect(vi.mocked(email.sendPaymentSuspensionEmail).mock.calls.length).toBe(emailsAfterFirst);
    const audits = await prisma.auditLog.count({
      where: { cabinetId: cabinet.id, action: 'BILLING_STATUS_CHANGED' },
    });
    expect(audits).toBe(1);
  });

  it('conserve le debut du delai apres le passage en impaye', async () => {
    const since = new Date(now.getTime() - 9 * DAY);
    const cabinet = await createCabinet({ billingStatus: 'DELAI_GRACE', pastDueSince: since });

    await suspendOverdueCabinets(now);

    expect((await stateOf(cabinet.id)).pastDueSince?.getTime()).toBe(since.getTime());
  });
});

describe('route /api/cron/suspend-overdue-cabinets', () => {
  const url = 'http://localhost/api/cron/suspend-overdue-cabinets';

  it('refuse sans secret ou avec un mauvais secret', async () => {
    expect((await GET(new Request(url))).status).toBe(401);
    expect(
      (await GET(new Request(url, { headers: { authorization: 'Bearer faux-secret' } }))).status,
    ).toBe(401);
  });

  it('refuse "Bearer undefined" quand aucun secret n est configure', async () => {
    const previous = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const res = await GET(new Request(url, { headers: { authorization: 'Bearer undefined' } }));
      expect(res.status).toBe(401);
    } finally {
      if (previous !== undefined) process.env.CRON_SECRET = previous;
    }
  });

  it('execute la tache avec le bon secret', async () => {
    const cabinet = await createCabinet({
      billingStatus: 'DELAI_GRACE',
      pastDueSince: new Date(Date.now() - 8 * DAY),
    });

    const res = await GET(
      new Request(url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).suspended).toBeGreaterThanOrEqual(1);
    expect((await stateOf(cabinet.id)).billingStatus).toBe('IMPAYE');
  });
});
