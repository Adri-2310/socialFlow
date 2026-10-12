// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { getCabinetOverview } from '@/lib/cabinet-data';
import { TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

// Donnees creees directement via Prisma (pas via le flux d'inscription) :
// on teste uniquement la couche de lecture et son isolation par cabinet.
const stamp = Date.now();
const cabinetIds: string[] = [];

async function createCabinet(name: string) {
  const cabinet = await prisma.cabinet.create({ data: { name } });
  cabinetIds.push(cabinet.id);
  return cabinet;
}

let userCounter = 0;
async function createUser(data: {
  cabinetId: string;
  role: string;
  status?: string;
  deletedAt?: Date | null;
  plan?: string | null;
  billingPeriod?: string | null;
}) {
  userCounter += 1;
  const id = `cabinet-data-${stamp}-${userCounter}`;
  return prisma.user.create({
    data: {
      id,
      name: `Utilisateur ${userCounter}`,
      email: `${TEST_EMAIL_PREFIX}cabinet-data-${stamp}-${userCounter}@example.com`,
      ...data,
    },
  });
}

afterAll(async () => {
  await prisma.invitation.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
});

describe('getCabinetOverview', () => {
  it('compte les gestionnaires du cabinet sans ceux des autres ni les archives', async () => {
    const mine = await createCabinet(`Cabinet A ${stamp}`);
    const other = await createCabinet(`Cabinet B ${stamp}`);

    await createUser({
      cabinetId: mine.id,
      role: 'CABINET_RH',
      plan: 'starter',
      billingPeriod: 'monthly',
    });
    await createUser({ cabinetId: mine.id, role: 'GESTIONNAIRE_RH' });
    await createUser({ cabinetId: mine.id, role: 'GESTIONNAIRE_RH', status: 'suspendu' });
    await createUser({ cabinetId: mine.id, role: 'GESTIONNAIRE_RH', deletedAt: new Date() });
    await createUser({ cabinetId: other.id, role: 'GESTIONNAIRE_RH' });

    const overview = await getCabinetOverview(mine.id);

    expect(overview.cabinetName).toBe(`Cabinet A ${stamp}`);
    expect(overview.gestionnaires).toEqual({ total: 2, actifs: 1, suspendus: 1 });
    expect(overview.subscription.billingPeriod).toBe('monthly');
    // Nom issu de PricingPlan s'il existe, sinon repli sur l'identifiant.
    expect(overview.subscription.planName?.toLowerCase()).toBe('starter');
  });

  it('ne compte que les invitations en attente et non expirees de ce cabinet', async () => {
    const mine = await createCabinet(`Cabinet C ${stamp}`);
    const other = await createCabinet(`Cabinet D ${stamp}`);
    const inviter = await createUser({ cabinetId: mine.id, role: 'CABINET_RH' });
    const otherInviter = await createUser({ cabinetId: other.id, role: 'CABINET_RH' });

    const inOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const base = { role: 'GESTIONNAIRE_RH', expiresAt: inOneDay };

    await prisma.invitation.createMany({
      data: [
        {
          ...base,
          email: `a-${stamp}@example.com`,
          token: `t-a-${stamp}`,
          cabinetId: mine.id,
          invitedById: inviter.id,
        },
        {
          ...base,
          email: `b-${stamp}@example.com`,
          token: `t-b-${stamp}`,
          cabinetId: mine.id,
          invitedById: inviter.id,
          expiresAt: yesterday,
        },
        {
          ...base,
          email: `c-${stamp}@example.com`,
          token: `t-c-${stamp}`,
          cabinetId: mine.id,
          invitedById: inviter.id,
          status: 'accepted',
        },
        {
          ...base,
          email: `d-${stamp}@example.com`,
          token: `t-d-${stamp}`,
          cabinetId: other.id,
          invitedById: otherInviter.id,
        },
      ],
    });

    const overview = await getCabinetOverview(mine.id);
    expect(overview.pendingInvitations).toBe(1);
  });

  it('resout le nom du plan depuis PricingPlan, avec repli sur l identifiant', async () => {
    const cabinet = await createCabinet(`Cabinet E ${stamp}`);
    await createUser({ cabinetId: cabinet.id, role: 'CABINET_RH', plan: `plan-inconnu-${stamp}` });

    const overview = await getCabinetOverview(cabinet.id);
    expect(overview.subscription.planName).toBe(`plan-inconnu-${stamp}`);
  });

  it('renvoie un abonnement vide pour un cabinet sans titulaire', async () => {
    const cabinet = await createCabinet(`Cabinet F ${stamp}`);

    const overview = await getCabinetOverview(cabinet.id);
    expect(overview.subscription).toEqual({ planName: null, billingPeriod: null });
    expect(overview.gestionnaires.total).toBe(0);
  });
});
