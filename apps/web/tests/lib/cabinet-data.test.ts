// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  getCabinetOverview,
  getGestionnaires,
  getInvitations,
  invitationDisplayStatus,
} from '@/lib/cabinet-data';
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

describe('getGestionnaires', () => {
  it('ne liste que les gestionnaires non archives de ce cabinet', async () => {
    const mine = await createCabinet(`Cabinet G ${stamp}`);
    const other = await createCabinet(`Cabinet H ${stamp}`);

    await createUser({ cabinetId: mine.id, role: 'CABINET_RH' });
    const actif = await createUser({ cabinetId: mine.id, role: 'GESTIONNAIRE_RH' });
    const suspendu = await createUser({
      cabinetId: mine.id,
      role: 'GESTIONNAIRE_RH',
      status: 'suspendu',
    });
    await createUser({ cabinetId: mine.id, role: 'GESTIONNAIRE_RH', deletedAt: new Date() });
    await createUser({ cabinetId: other.id, role: 'GESTIONNAIRE_RH' });

    const rows = await getGestionnaires(mine.id);

    expect(rows.map((r) => r.id)).toEqual([actif.id, suspendu.id]);
    expect(rows.map((r) => r.status)).toEqual(['actif', 'suspendu']);
  });
});

describe('getInvitations', () => {
  it('liste les invitations de ce cabinet avec leur statut affiche, sans jeton', async () => {
    const mine = await createCabinet(`Cabinet I ${stamp}`);
    const other = await createCabinet(`Cabinet J ${stamp}`);
    const inviter = await createUser({ cabinetId: mine.id, role: 'CABINET_RH' });
    const otherInviter = await createUser({ cabinetId: other.id, role: 'CABINET_RH' });

    const inOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const base = { role: 'GESTIONNAIRE_RH', cabinetId: mine.id, invitedById: inviter.id };

    await prisma.invitation.createMany({
      data: [
        { ...base, email: `p-${stamp}@example.com`, token: `g-p-${stamp}`, expiresAt: inOneDay },
        { ...base, email: `e-${stamp}@example.com`, token: `g-e-${stamp}`, expiresAt: yesterday },
        {
          ...base,
          email: `r-${stamp}@example.com`,
          token: `g-r-${stamp}`,
          expiresAt: inOneDay,
          status: 'revoked',
        },
        {
          role: 'GESTIONNAIRE_RH',
          email: `x-${stamp}@example.com`,
          token: `g-x-${stamp}`,
          expiresAt: inOneDay,
          cabinetId: other.id,
          invitedById: otherInviter.id,
        },
      ],
    });

    const rows = await getInvitations(mine.id);
    const byEmail = Object.fromEntries(rows.map((r) => [r.email, r.status]));

    expect(rows).toHaveLength(3);
    expect(byEmail).toEqual({
      [`p-${stamp}@example.com`]: 'pending',
      [`e-${stamp}@example.com`]: 'expired',
      [`r-${stamp}@example.com`]: 'revoked',
    });
    // Le jeton ne doit jamais sortir de la couche de lecture.
    for (const row of rows) expect(row).not.toHaveProperty('token');
  });
});

describe('invitationDisplayStatus', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const future = new Date('2026-10-14T12:00:00Z');
  const past = new Date('2026-10-12T12:00:00Z');

  it('presente une invitation pending depassee comme expiree', () => {
    expect(invitationDisplayStatus('pending', future, now)).toBe('pending');
    expect(invitationDisplayStatus('pending', past, now)).toBe('expired');
  });

  it('conserve les statuts terminaux meme si la date n est pas depassee', () => {
    expect(invitationDisplayStatus('accepted', future, now)).toBe('accepted');
    expect(invitationDisplayStatus('revoked', future, now)).toBe('revoked');
  });
});
