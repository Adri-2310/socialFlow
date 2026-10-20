// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { AUDIT_PAGE_SIZE, getCabinetAuditLog, getCabinetAuditUsers } from '@/lib/cabinet/cabinet-audit';
import { TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

const stamp = Date.now();
const cabinetIds: string[] = [];

async function createCabinet(name: string) {
  const cabinet = await prisma.cabinet.create({ data: { name } });
  cabinetIds.push(cabinet.id);
  return cabinet;
}

let counter = 0;
async function createUser(cabinetId: string | null, role: string, name?: string) {
  counter += 1;
  return prisma.user.create({
    data: {
      id: `cabinet-audit-${stamp}-${counter}`,
      name: name ?? `Utilisateur ${counter}`,
      email: `${TEST_EMAIL_PREFIX}cabinet-audit-${stamp}-${counter}@example.com`,
      role,
      cabinetId,
    },
  });
}

async function log(data: {
  action: string;
  cabinetId: string;
  actorId?: string;
  targetUserId?: string;
  createdAt?: Date;
  metadata?: Record<string, string>;
}) {
  return prisma.auditLog.create({ data });
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: `${TEST_EMAIL_PREFIX}cabinet-audit-${stamp}` } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
});

describe('getCabinetAuditLog', () => {
  it('ne renvoie que les entrees de ce cabinet, hors actions de configuration', async () => {
    const mine = await createCabinet(`Audit A ${stamp}`);
    const other = await createCabinet(`Audit B ${stamp}`);
    const owner = await createUser(mine.id, 'CABINET_RH', 'Titulaire A');
    const otherOwner = await createUser(other.id, 'CABINET_RH', 'Titulaire B');

    await log({ action: 'INVITATION_SENT', cabinetId: mine.id, actorId: owner.id, metadata: { email: 'x@a.be' } });
    await log({ action: 'INVITATION_SENT', cabinetId: other.id, actorId: otherOwner.id });
    await log({ action: 'PRICING_PLAN_UPDATED', cabinetId: mine.id, actorId: owner.id });

    const result = await getCabinetAuditLog(mine.id);

    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].message).toBe('Invitation envoyée à x@a.be');
    expect(result.entries[0].actorLabel).toBe('Titulaire A');
  });

  it('ignore un filtre de personne venant d un autre cabinet (aucune fuite)', async () => {
    const mine = await createCabinet(`Audit C ${stamp}`);
    const other = await createCabinet(`Audit D ${stamp}`);
    const owner = await createUser(mine.id, 'CABINET_RH');
    const stranger = await createUser(other.id, 'GESTIONNAIRE_RH');

    await log({ action: 'USER_SUSPENDED', cabinetId: mine.id, actorId: owner.id });
    await log({ action: 'USER_SUSPENDED', cabinetId: other.id, targetUserId: stranger.id });

    const result = await getCabinetAuditLog(mine.id, { userId: stranger.id });
    expect(result.total).toBe(0);
  });

  it('filtre par action, par personne (auteur ou cible) et par periode', async () => {
    const cabinet = await createCabinet(`Audit E ${stamp}`);
    const owner = await createUser(cabinet.id, 'CABINET_RH', 'Titulaire');
    const gest = await createUser(cabinet.id, 'GESTIONNAIRE_RH', 'Alice');

    await log({
      action: 'USER_SUSPENDED',
      cabinetId: cabinet.id,
      actorId: owner.id,
      targetUserId: gest.id,
      createdAt: new Date('2026-07-15T10:00:00Z'),
    });
    await log({
      action: 'INVITATION_SENT',
      cabinetId: cabinet.id,
      actorId: owner.id,
      createdAt: new Date('2026-07-16T10:00:00Z'),
      metadata: { email: 'n@a.be' },
    });
    await log({
      action: 'INVITATION_ACCEPTED',
      cabinetId: cabinet.id,
      actorId: gest.id,
      createdAt: new Date('2026-08-01T10:00:00Z'),
      metadata: { email: 'alice@a.be' },
    });

    const parAction = await getCabinetAuditLog(cabinet.id, { action: 'INVITATION_SENT' });
    expect(parAction.total).toBe(1);

    // Action inconnue : ignoree, pas de filtre silencieusement vide.
    const inconnue = await getCabinetAuditLog(cabinet.id, { action: 'PRICING_PLAN_UPDATED' });
    expect(inconnue.total).toBe(3);

    // Alice : cible d'une action et auteur d'une autre.
    const parPersonne = await getCabinetAuditLog(cabinet.id, { userId: gest.id });
    expect(parPersonne.total).toBe(2);

    const parPeriode = await getCabinetAuditLog(cabinet.id, { from: '2026-07-16', to: '2026-07-31' });
    expect(parPeriode.total).toBe(1);
    expect(parPeriode.entries[0].action).toBe('INVITATION_SENT');

    // Jour "to" inclus.
    const jourInclus = await getCabinetAuditLog(cabinet.id, { from: '2026-08-01', to: '2026-08-01' });
    expect(jourInclus.total).toBe(1);
  });

  it('trie du plus recent au plus ancien et pagine', async () => {
    const cabinet = await createCabinet(`Audit F ${stamp}`);
    const owner = await createUser(cabinet.id, 'CABINET_RH');
    const total = AUDIT_PAGE_SIZE + 5;

    await prisma.auditLog.createMany({
      data: Array.from({ length: total }, (_, i) => ({
        action: 'INVITATION_SENT',
        cabinetId: cabinet.id,
        actorId: owner.id,
        createdAt: new Date(Date.UTC(2026, 5, 1, 0, i)),
      })),
    });

    const first = await getCabinetAuditLog(cabinet.id, {}, 1);
    expect(first.total).toBe(total);
    expect(first.pageCount).toBe(2);
    expect(first.entries).toHaveLength(AUDIT_PAGE_SIZE);
    expect(first.entries[0].createdAt.getTime()).toBeGreaterThan(
      first.entries[1].createdAt.getTime(),
    );

    const second = await getCabinetAuditLog(cabinet.id, {}, 2);
    expect(second.entries).toHaveLength(5);

    // Page hors limites : ramenee a la derniere.
    const beyond = await getCabinetAuditLog(cabinet.id, {}, 99);
    expect(beyond.page).toBe(2);
  });

  it('n expose jamais l identite d un SuperAdmin', async () => {
    const cabinet = await createCabinet(`Audit G ${stamp}`);
    const admin = await createUser(null, 'SUPER_ADMIN', 'Nom Secret Admin');
    await log({ action: 'USER_SUSPENDED', cabinetId: cabinet.id, actorId: admin.id });

    const result = await getCabinetAuditLog(cabinet.id);

    expect(result.entries[0].actorLabel).toBe('Administration SocialFlow');
    expect(JSON.stringify(result)).not.toContain('Nom Secret Admin');
  });

  it('ne masque pas une entree dont l acteur a ete supprime', async () => {
    const cabinet = await createCabinet(`Audit H ${stamp}`);
    await log({ action: 'INVITATION_SENT', cabinetId: cabinet.id, metadata: { email: 'x@a.be' } });

    const result = await getCabinetAuditLog(cabinet.id);
    expect(result.entries[0].message).toBe('Invitation envoyée à x@a.be');
    expect(result.entries[0].actorLabel).toBeNull();
  });

  it('n affiche pas le cycle de vie du cabinet (creation, suspension, archivage)', async () => {
    const cabinet = await createCabinet(`Audit K ${stamp}`);
    for (const action of [
      'CABINET_CREATED',
      'CABINET_SUSPENDED',
      'CABINET_REACTIVATED',
      'CABINET_ARCHIVED',
      'CABINET_RESTORED',
    ]) {
      await log({ action, cabinetId: cabinet.id });
    }

    expect((await getCabinetAuditLog(cabinet.id)).total).toBe(0);
    // Meme avec le filtre : une action masquee n'est pas interrogeable.
    expect((await getCabinetAuditLog(cabinet.id, { action: 'CABINET_CREATED' })).total).toBe(0);
  });
});

describe('getCabinetAuditUsers', () => {
  it('liste les gestionnaires du cabinet, sans le titulaire ni ceux des autres cabinets', async () => {
    const mine = await createCabinet(`Audit I ${stamp}`);
    const other = await createCabinet(`Audit J ${stamp}`);
    await createUser(mine.id, 'CABINET_RH', 'Zoe');
    const b = await createUser(mine.id, 'GESTIONNAIRE_RH', 'Alice');
    const c = await createUser(mine.id, 'GESTIONNAIRE_RH', 'Bruno');
    await createUser(other.id, 'GESTIONNAIRE_RH', 'Etranger');

    const users = await getCabinetAuditUsers(mine.id);
    expect(users.map((u) => u.id)).toEqual([b.id, c.id]);
  });
});
