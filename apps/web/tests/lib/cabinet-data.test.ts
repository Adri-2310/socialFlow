// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  getArchivedGestionnaires,
  getCabinetOverview,
  getGestionnaires,
  getInvitations,
  getSelfDeletedGestionnaires,
  invitationDisplayStatus,
} from '@/lib/cabinet-data';
import { TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

// Donnees creees directement via Prisma (pas via le flux d'inscription) :
// on teste uniquement la couche de lecture et son isolation par cabinet.
const stamp = Date.now();
const cabinetIds: string[] = [];

async function createCabinet(
  name: string,
  data: {
    planId?: string | null;
    billingPeriod?: string | null;
    billingStatus?: string;
    trialEndsAt?: Date | null;
  } = {},
) {
  const cabinet = await prisma.cabinet.create({ data: { name, ...data } });
  cabinetIds.push(cabinet.id);
  return cabinet;
}

let userCounter = 0;
async function createUser(data: {
  cabinetId: string;
  role: string;
  status?: string;
  suspendedBy?: string | null;
  deletedBy?: string | null;
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
    const mine = await createCabinet(`Cabinet A ${stamp}`, {
      planId: 'starter',
      billingPeriod: 'monthly',
      billingStatus: 'ACTIF',
    });
    const other = await createCabinet(`Cabinet B ${stamp}`);

    await createUser({ cabinetId: mine.id, role: 'CABINET_RH' });
    await createUser({ cabinetId: mine.id, role: 'GESTIONNAIRE_RH' });
    await createUser({ cabinetId: mine.id, role: 'GESTIONNAIRE_RH', status: 'suspendu' });
    await createUser({ cabinetId: mine.id, role: 'GESTIONNAIRE_RH', deletedAt: new Date() });
    await createUser({ cabinetId: other.id, role: 'GESTIONNAIRE_RH' });

    const overview = await getCabinetOverview(mine.id);

    expect(overview.cabinetName).toBe(`Cabinet A ${stamp}`);
    expect(overview.gestionnaires).toEqual({ total: 2, actifs: 1, suspendus: 1 });
    expect(overview.subscription.billingPeriod).toBe('monthly');
    expect(overview.subscription.status).toBe('ACTIF');
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
          tokenHash: `t-a-${stamp}`,
          cabinetId: mine.id,
          invitedById: inviter.id,
        },
        {
          ...base,
          email: `b-${stamp}@example.com`,
          tokenHash: `t-b-${stamp}`,
          cabinetId: mine.id,
          invitedById: inviter.id,
          expiresAt: yesterday,
        },
        {
          ...base,
          email: `c-${stamp}@example.com`,
          tokenHash: `t-c-${stamp}`,
          cabinetId: mine.id,
          invitedById: inviter.id,
          status: 'accepted',
        },
        {
          ...base,
          email: `d-${stamp}@example.com`,
          tokenHash: `t-d-${stamp}`,
          cabinetId: other.id,
          invitedById: otherInviter.id,
        },
      ],
    });

    const overview = await getCabinetOverview(mine.id);
    expect(overview.pendingInvitations).toBe(1);
  });

  it('resout le nom du plan depuis PricingPlan, avec repli sur l identifiant', async () => {
    const cabinet = await createCabinet(`Cabinet E ${stamp}`, { planId: `plan-inconnu-${stamp}` });
    await createUser({ cabinetId: cabinet.id, role: 'CABINET_RH' });

    const overview = await getCabinetOverview(cabinet.id);
    expect(overview.subscription.planName).toBe(`plan-inconnu-${stamp}`);
  });

  it('lit l etat d essai et sa date de fin sur le cabinet', async () => {
    const trialEndsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const cabinet = await createCabinet(`Cabinet essai ${stamp}`, {
      planId: 'starter',
      billingStatus: 'ESSAI',
      trialEndsAt,
    });
    await createUser({ cabinetId: cabinet.id, role: 'CABINET_RH' });

    const overview = await getCabinetOverview(cabinet.id);
    expect(overview.subscription.status).toBe('ESSAI');
    expect(overview.subscription.trialEndsAt?.getTime()).toBe(trialEndsAt.getTime());
  });

  it('ne tient pas compte du plan figurant sur l utilisateur (D55)', async () => {
    const cabinet = await createCabinet(`Cabinet sans plan ${stamp}`);
    await createUser({ cabinetId: cabinet.id, role: 'CABINET_RH', plan: 'enterprise' });

    const overview = await getCabinetOverview(cabinet.id);
    expect(overview.subscription.planName).toBeNull();
  });

  it('renvoie un abonnement vide pour un cabinet sans titulaire', async () => {
    const cabinet = await createCabinet(`Cabinet F ${stamp}`);

    const overview = await getCabinetOverview(cabinet.id);
    expect(overview.subscription).toEqual({
      planName: null,
      billingPeriod: null,
      status: 'EN_ATTENTE_PAIEMENT',
      trialEndsAt: null,
      currentPeriodEnd: null,
    });
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

  it('indique si la suspension peut etre levee par le cabinet (D52)', async () => {
    const cabinet = await createCabinet(`Cabinet K ${stamp}`);
    const parCabinet = await createUser({
      cabinetId: cabinet.id,
      role: 'GESTIONNAIRE_RH',
      status: 'suspendu',
      suspendedBy: 'CABINET_RH',
    });
    const parAdmin = await createUser({
      cabinetId: cabinet.id,
      role: 'GESTIONNAIRE_RH',
      status: 'suspendu',
      suspendedBy: 'SUPER_ADMIN',
    });
    const sansAuteur = await createUser({
      cabinetId: cabinet.id,
      role: 'GESTIONNAIRE_RH',
      status: 'suspendu',
    });
    const actif = await createUser({ cabinetId: cabinet.id, role: 'GESTIONNAIRE_RH' });

    const rows = await getGestionnaires(cabinet.id);
    const reactivatable = Object.fromEntries(rows.map((r) => [r.id, r.reactivatableByCabinet]));

    expect(reactivatable).toEqual({
      [parCabinet.id]: true,
      [parAdmin.id]: false,
      [sansAuteur.id]: false,
      [actif.id]: false,
    });
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
        { ...base, email: `p-${stamp}@example.com`, tokenHash: `g-p-${stamp}`, expiresAt: inOneDay },
        { ...base, email: `e-${stamp}@example.com`, tokenHash: `g-e-${stamp}`, expiresAt: yesterday },
        {
          ...base,
          email: `r-${stamp}@example.com`,
          tokenHash: `g-r-${stamp}`,
          expiresAt: inOneDay,
          status: 'revoked',
        },
        {
          role: 'GESTIONNAIRE_RH',
          email: `x-${stamp}@example.com`,
          tokenHash: `g-x-${stamp}`,
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
    for (const row of rows) expect(row).not.toHaveProperty('tokenHash');
  });
});

describe('getArchivedGestionnaires', () => {
  const day = 24 * 60 * 60 * 1000;

  it('ne liste que les gestionnaires retires par le cabinet dans les 30 jours', async () => {
    const mine = await createCabinet(`Cabinet L ${stamp}`);
    const other = await createCabinet(`Cabinet M ${stamp}`);
    const now = new Date();

    const recent = await createUser({
      cabinetId: mine.id,
      role: 'GESTIONNAIRE_RH',
      deletedAt: new Date(now.getTime() - 5 * day),
      deletedBy: 'CABINET_RH',
    });
    await createUser({
      cabinetId: mine.id,
      role: 'GESTIONNAIRE_RH',
      deletedAt: new Date(now.getTime() - 31 * day),
      deletedBy: 'CABINET_RH',
    });
    await createUser({
      cabinetId: mine.id,
      role: 'GESTIONNAIRE_RH',
      deletedAt: new Date(now.getTime() - 2 * day),
      deletedBy: null,
    });
    await createUser({
      cabinetId: mine.id,
      role: 'GESTIONNAIRE_RH',
      deletedAt: new Date(now.getTime() - 2 * day),
      deletedBy: 'SUPER_ADMIN',
    });
    await createUser({ cabinetId: mine.id, role: 'GESTIONNAIRE_RH' });
    await createUser({
      cabinetId: other.id,
      role: 'GESTIONNAIRE_RH',
      deletedAt: new Date(now.getTime() - 1 * day),
      deletedBy: 'CABINET_RH',
    });

    const rows = await getArchivedGestionnaires(mine.id, now);

    expect(rows.map((r) => r.id)).toEqual([recent.id]);
    // Echeance = retrait + 30 jours.
    expect(rows[0].restorableUntil.getTime() - rows[0].deletedAt.getTime()).toBe(30 * day);
  });
});

describe('getSelfDeletedGestionnaires', () => {
  it('ne liste que les comptes supprimes par la personne dans ce cabinet', async () => {
    const mine = await createCabinet(`Cabinet S ${stamp}`);
    const other = await createCabinet(`Cabinet T ${stamp}`);

    const self = await createUser({
      cabinetId: mine.id,
      role: 'GESTIONNAIRE_RH',
      deletedAt: new Date(),
      deletedBy: null,
    });
    await createUser({
      cabinetId: mine.id,
      role: 'GESTIONNAIRE_RH',
      deletedAt: new Date(),
      deletedBy: 'CABINET_RH',
    });
    await createUser({
      cabinetId: mine.id,
      role: 'GESTIONNAIRE_RH',
      deletedAt: new Date(),
      deletedBy: 'SUPER_ADMIN',
    });
    await createUser({ cabinetId: mine.id, role: 'GESTIONNAIRE_RH' });
    await createUser({
      cabinetId: other.id,
      role: 'GESTIONNAIRE_RH',
      deletedAt: new Date(),
      deletedBy: null,
    });

    const rows = await getSelfDeletedGestionnaires(mine.id);
    expect(rows.map((r) => r.id)).toEqual([self.id]);
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
