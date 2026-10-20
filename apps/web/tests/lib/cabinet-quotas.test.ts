// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  getCabinetPlanQuotas,
  getCabinetQuotaUsage,
  isQuotaReached,
  quotaExceededBody,
  quotaPercent,
  reserveQuotas,
  stricterLimit,
} from '@/lib/billing/cabinet-quotas';
import { TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

const stamp = Date.now();
const cabinetIds: string[] = [];
const planIds: string[] = [];

async function createCabinet(name: string, planId: string | null = null) {
  const cabinet = await prisma.cabinet.create({ data: { name, planId } });
  cabinetIds.push(cabinet.id);
  return cabinet;
}

async function createPlan(quotas: {
  maxEntreprises?: number | null;
  maxUtilisateurs?: number | null;
  maxStorageMb?: number | null;
}) {
  const planId = `vitest-quota-${stamp}-${planIds.length}`;
  planIds.push(planId);
  await prisma.pricingPlan.create({
    data: { planId, name: planId, description: 'plan de test', features: ['test'], ...quotas },
  });
  return planId;
}

let counter = 0;
async function createUser(data: {
  cabinetId: string;
  role: string;
  status?: string;
  plan?: string | null;
  deletedAt?: Date | null;
}) {
  counter += 1;
  return prisma.user.create({
    data: {
      id: `cabinet-quotas-${stamp}-${counter}`,
      name: `Utilisateur ${counter}`,
      email: `${TEST_EMAIL_PREFIX}cabinet-quotas-${stamp}-${counter}@example.com`,
      ...data,
    },
  });
}

afterAll(async () => {
  await prisma.invitation.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
  await prisma.pricingPlan.deleteMany({ where: { planId: { in: planIds } } });
});

describe('regles pures', () => {
  it('atteint le quota des que l usage egale la limite, jamais si illimite', () => {
    expect(isQuotaReached(2, 3)).toBe(false);
    expect(isQuotaReached(3, 3)).toBe(true);
    expect(isQuotaReached(4, 3)).toBe(true);
    expect(isQuotaReached(1000, null)).toBe(false);
  });

  it('borne le pourcentage entre 0 et 100', () => {
    expect(quotaPercent(1, 4)).toBe(25);
    expect(quotaPercent(9, 3)).toBe(100);
    expect(quotaPercent(5, null)).toBe(0);
    expect(quotaPercent(5, 0)).toBe(0);
  });
});

describe('quotas reserves pendant un downgrade programme (D75)', () => {
  it('prend la limite la plus stricte, null valant illimite', () => {
    expect(stricterLimit(10, 3)).toBe(3);
    expect(stricterLimit(3, 10)).toBe(3);
    expect(stricterLimit(null, 3)).toBe(3);
    expect(stricterLimit(3, null)).toBe(3);
    expect(stricterLimit(null, null)).toBeNull();

    expect(
      reserveQuotas(
        { maxEntreprises: 25, maxUtilisateurs: 10, maxStorageMb: null },
        { maxEntreprises: null, maxUtilisateurs: 2, maxStorageMb: 500 },
      ),
    ).toEqual({ maxEntreprises: 25, maxUtilisateurs: 2, maxStorageMb: 500 });
  });

  it('applique le plus strict du plan actuel et du plan vise, et nomme le plan vise', async () => {
    const grand = await createPlan({ maxEntreprises: 25, maxUtilisateurs: 10, maxStorageMb: 5000 });
    const petit = await createPlan({ maxEntreprises: 5, maxUtilisateurs: 2, maxStorageMb: null });
    const cabinet = await createCabinet('Reserve', grand);
    await prisma.cabinet.update({ where: { id: cabinet.id }, data: { pendingPlanId: petit } });

    const quotas = await getCabinetPlanQuotas(cabinet.id);
    expect(quotas).toMatchObject({ maxEntreprises: 5, maxUtilisateurs: 2, maxStorageMb: 5000, pendingPlanName: petit });

    // Meme limite dans la consommation affichee et dans les controles de creation.
    const usage = await getCabinetQuotaUsage(cabinet.id);
    expect(usage.limits).toMatchObject({ maxEntreprises: 5, maxUtilisateurs: 2 });
  });

  it('ne change rien sans plan en attente, pour le meme plan, ou si le plan vise a disparu', async () => {
    const grand = await createPlan({ maxEntreprises: 25, maxUtilisateurs: 10, maxStorageMb: 5000 });
    const sans = await createCabinet('Sans attente', grand);
    expect(await getCabinetPlanQuotas(sans.id)).toEqual({ maxEntreprises: 25, maxUtilisateurs: 10, maxStorageMb: 5000 });

    const meme = await createCabinet('Meme plan', grand);
    await prisma.cabinet.update({ where: { id: meme.id }, data: { pendingPlanId: grand } });
    const sameQuotas = await getCabinetPlanQuotas(meme.id);
    expect(sameQuotas).toEqual({ maxEntreprises: 25, maxUtilisateurs: 10, maxStorageMb: 5000 });

    const disparu = await createCabinet('Plan disparu', grand);
    await prisma.cabinet.update({ where: { id: disparu.id }, data: { pendingPlanId: 'vitest-plan-disparu' } });
    expect(await getCabinetPlanQuotas(disparu.id)).toEqual({ maxEntreprises: 25, maxUtilisateurs: 10, maxStorageMb: 5000 });
  });

  it('bloque une creation au quota du plan vise et le dit dans la reponse d erreur', async () => {
    const grand = await createPlan({ maxEntreprises: 25, maxUtilisateurs: 10, maxStorageMb: 5000 });
    const petit = await createPlan({ maxEntreprises: 5, maxUtilisateurs: 1, maxStorageMb: null });
    const cabinet = await createCabinet('Bloque', grand);
    await prisma.cabinet.update({ where: { id: cabinet.id }, data: { pendingPlanId: petit } });
    await createUser({ cabinetId: cabinet.id, role: 'GESTIONNAIRE_RH' });

    const { limits, utilisateurs } = await getCabinetQuotaUsage(cabinet.id);
    // 1 gestionnaire sur 10 au plan actuel, mais 1 sur 1 au plan vise : atteint.
    expect(isQuotaReached(utilisateurs.used, limits!.maxUtilisateurs)).toBe(true);
    expect(quotaExceededBody('maxUtilisateurs', 1, 1, limits!.pendingPlanName)).toEqual({
      error: 'QUOTA_EXCEEDED',
      quota: 'maxUtilisateurs',
      limit: 1,
      used: 1,
      pendingPlan: petit,
    });
    // Sans plan vise, la reponse garde sa forme d'origine.
    expect(quotaExceededBody('maxUtilisateurs', 1, 1)).toEqual({
      error: 'QUOTA_EXCEEDED',
      quota: 'maxUtilisateurs',
      limit: 1,
      used: 1,
    });
  });
});

describe('getCabinetQuotaUsage', () => {
  it('lit les limites du plan du cabinet et compte les gestionnaires, sans le titulaire', async () => {
    const planId = await createPlan({
      maxEntreprises: 25,
      maxUtilisateurs: 5,
      maxStorageMb: 5120,
    });
    const mine = await createCabinet(`Cabinet quota A ${stamp}`, planId);
    const other = await createCabinet(`Cabinet quota B ${stamp}`);

    const owner = await createUser({ cabinetId: mine.id, role: 'CABINET_RH' });
    await createUser({ cabinetId: mine.id, role: 'GESTIONNAIRE_RH' });
    await createUser({ cabinetId: mine.id, role: 'GESTIONNAIRE_RH', status: 'suspendu' });
    // Archive : ne compte plus.
    await createUser({ cabinetId: mine.id, role: 'GESTIONNAIRE_RH', deletedAt: new Date() });
    // Autre cabinet : jamais compte.
    await createUser({ cabinetId: other.id, role: 'GESTIONNAIRE_RH' });

    const inOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const base = { role: 'GESTIONNAIRE_RH', cabinetId: mine.id, invitedById: owner.id };
    await prisma.invitation.createMany({
      data: [
        { ...base, email: `q-a-${stamp}@example.com`, tokenHash: `q-a-${stamp}`, expiresAt: inOneDay },
        // Expiree, revoquee : ne reservent plus de place.
        { ...base, email: `q-b-${stamp}@example.com`, tokenHash: `q-b-${stamp}`, expiresAt: yesterday },
        {
          ...base,
          email: `q-c-${stamp}@example.com`,
          tokenHash: `q-c-${stamp}`,
          expiresAt: inOneDay,
          status: 'revoked',
        },
      ],
    });

    const usage = await getCabinetQuotaUsage(mine.id);

    expect(usage.limits).toEqual({ maxEntreprises: 25, maxUtilisateurs: 5, maxStorageMb: 5120 });
    // D56 : 2 gestionnaires (actif + suspendu), le titulaire ne compte pas.
    expect(usage.utilisateurs).toEqual({ members: 2, pendingInvitations: 1, used: 3 });
    expect(usage.entreprises.used).toBe(0);
    expect(usage.storageMb.used).toBe(0);
  });

  it('renvoie des limites nulles pour un plan illimite', async () => {
    const planId = await createPlan({});
    const cabinet = await createCabinet(`Cabinet quota C ${stamp}`, planId);
    await createUser({ cabinetId: cabinet.id, role: 'CABINET_RH' });

    const usage = await getCabinetQuotaUsage(cabinet.id);
    expect(usage.limits).toEqual({
      maxEntreprises: null,
      maxUtilisateurs: null,
      maxStorageMb: null,
    });
    expect(isQuotaReached(usage.utilisateurs.used, usage.limits!.maxUtilisateurs)).toBe(false);
  });

  it('n applique aucun quota sans plan connu', async () => {
    const sansPlan = await createCabinet(`Cabinet quota D ${stamp}`);
    await createUser({ cabinetId: sansPlan.id, role: 'CABINET_RH' });
    expect((await getCabinetQuotaUsage(sansPlan.id)).limits).toBeNull();

    const planInconnu = await createCabinet(`Cabinet quota E ${stamp}`, `plan-supprime-${stamp}`);
    await createUser({ cabinetId: planInconnu.id, role: 'CABINET_RH' });
    expect((await getCabinetQuotaUsage(planInconnu.id)).limits).toBeNull();
  });

  it('continue d appliquer un plan archive', async () => {
    const planId = await createPlan({ maxUtilisateurs: 2 });
    await prisma.pricingPlan.update({ where: { planId }, data: { archivedAt: new Date() } });
    const cabinet = await createCabinet(`Cabinet quota F ${stamp}`, planId);
    await createUser({ cabinetId: cabinet.id, role: 'CABINET_RH' });

    const usage = await getCabinetQuotaUsage(cabinet.id);
    expect(usage.limits?.maxUtilisateurs).toBe(2);
  });
});
