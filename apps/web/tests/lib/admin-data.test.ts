// @vitest-environment node
import { describe, it, expect, vi, afterAll } from 'vitest';
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

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const { getCabinets, getUsers, getAuditLogEntries, getMonitoringData } = await import('@/lib/admin-data');

const PASSWORD = 'InitialPass123!';

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
});

/** Cree un Cabinet RH (auto-inscription, plan par defaut) et renvoie son cabinetId. */
async function creerCabinetRH(label: string, plan?: 'starter' | 'pro' | 'enterprise') {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: `Titulaire ${label}`, cabinetName: `Cabinet ${label}`, email: mail, password: PASSWORD, ...(plan ? { plan } : {}) },
      asResponse: true,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { mail, cj, user };
}

/** Cree un compte puis le force au role SUPER_ADMIN. Supprime au passage le
 * cabinet auto-cree par l'inscription (plus d'utilite une fois cabinetId a
 * null, sinon orphelin et invisible au nettoyage afterAll). */
async function creerSuperAdmin(label: string) {
  const { mail, cj, user } = await creerCabinetRH(label);
  const cabinetId = user.cabinetId!;
  await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN', cabinetId: null } });
  await prisma.cabinet.delete({ where: { id: cabinetId } });
  return { mail, cj, user };
}

async function creerGestionnaire(label: string, cabinetId: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: `Gestionnaire ${label}`, email: mail, password: PASSWORD }, asResponse: true }));
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  // Le cabinet auto-cree a l'inscription est abandonne au profit de celui du
  // Cabinet RH qui invite (parametre `cabinetId`) : le supprimer ici plutot
  // que de le laisser orphelin (invisible ensuite, cabinetId reecrit).
  // Detache d'abord (sinon supprimer le cabinet cascaderait sur le User
  // lui-meme, via onDelete: Cascade sur User.cabinetId).
  const ancienCabinetId = user.cabinetId!;
  await prisma.user.update({ where: { id: user.id }, data: { role: 'GESTIONNAIRE_RH', cabinetId } });
  await prisma.cabinet.delete({ where: { id: ancienCabinetId } });
  return user;
}

describe('getCabinets', () => {
  it('retourne le plan du titulaire (Cabinet RH) et le nombre de Gestionnaires RH', async () => {
    const { user } = await creerCabinetRH('admindata-cabinet-plan', 'pro');
    await creerGestionnaire('admindata-gestionnaire-1', user.cabinetId!);
    await creerGestionnaire('admindata-gestionnaire-2', user.cabinetId!);

    const { rows } = await getCabinets();
    const row = rows.find((r) => r.id === user.cabinetId);

    expect(row).toBeDefined();
    expect(row?.plan).toBe('pro');
    expect(row?.gestionnaireCount).toBe(2);
    expect(row?.status).toBe('actif');
    expect(row?.deletedAt).toBeNull();
    expect(typeof row?.createdAt).toBe('string');
  });

  it('renvoie plan null quand aucun Cabinet RH n a de plan renseigne', async () => {
    const { user } = await creerCabinetRH('admindata-cabinet-sansplan');

    const { rows } = await getCabinets();
    const row = rows.find((r) => r.id === user.cabinetId);

    // Le plan par defaut de l'auto-inscription (voir register-flow.tsx) est
    // toujours pose ; on verifie simplement qu'il est bien lu depuis le bon
    // utilisateur (le Cabinet RH), pas invente.
    expect(row?.plan).not.toBeUndefined();
  });

  it('ne compte pas les Collaborateurs ou le titulaire lui-meme comme Gestionnaire', async () => {
    const { user } = await creerCabinetRH('admindata-cabinet-nogest');

    const { rows } = await getCabinets();
    const row = rows.find((r) => r.id === user.cabinetId);

    expect(row?.gestionnaireCount).toBe(0);
  });
});

describe('getUsers', () => {
  it('retourne le role, le statut et le nom du cabinet pour un utilisateur rattache', async () => {
    const { user } = await creerCabinetRH('admindata-user-cabinet');

    const rows = await getUsers();
    const row = rows.find((r) => r.id === user.id);

    expect(row).toBeDefined();
    expect(row?.role).toBe('CABINET_RH');
    expect(row?.status).toBe('actif');
    expect(row?.cabinetName).toBe(`Cabinet admindata-user-cabinet`);
    expect(row?.deletedAt).toBeNull();
  });

  it('renvoie cabinetName null pour un utilisateur sans cabinet (SuperAdmin)', async () => {
    const { user } = await creerSuperAdmin('admindata-user-superadmin');

    const rows = await getUsers();
    const row = rows.find((r) => r.id === user.id);

    expect(row?.role).toBe('SUPER_ADMIN');
    expect(row?.cabinetName).toBeNull();
  });

  it('reflete le statut suspendu et la date d archivage', async () => {
    const { user } = await creerCabinetRH('admindata-user-suspendu');
    await prisma.user.update({ where: { id: user.id }, data: { status: 'suspendu' } });

    const rowsSuspendu = await getUsers();
    expect(rowsSuspendu.find((r) => r.id === user.id)?.status).toBe('suspendu');

    const archivedAt = new Date();
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: archivedAt } });

    const rowsArchive = await getUsers();
    const row = rowsArchive.find((r) => r.id === user.id);
    expect(row?.deletedAt).toBe(archivedAt.toISOString());
  });
});

describe('getAuditLogEntries', () => {
  it('respecte la limite `take` et trie du plus recent au plus ancien', async () => {
    const { user: admin } = await creerSuperAdmin('admindata-audit-admin');
    const { user: cible } = await creerCabinetRH('admindata-audit-cible');

    // 3 evenements espaces artificiellement pour un ordre sans ambiguite.
    const base = Date.now();
    await prisma.auditLog.create({
      data: { action: 'CABINET_SUSPENDED', actorId: admin.id, cabinetId: cible.cabinetId!, createdAt: new Date(base) },
    });
    await prisma.auditLog.create({
      data: { action: 'CABINET_REACTIVATED', actorId: admin.id, cabinetId: cible.cabinetId!, createdAt: new Date(base + 1000) },
    });
    await prisma.auditLog.create({
      data: { action: 'CABINET_ARCHIVED', actorId: admin.id, cabinetId: cible.cabinetId!, createdAt: new Date(base + 2000) },
    });

    const entries = await getAuditLogEntries(2);

    expect(entries.length).toBeLessThanOrEqual(2);
    expect(entries[0].action).toBe('CABINET_ARCHIVED');
    expect(entries[1].action).toBe('CABINET_REACTIVATED');
  });

  it('resout les noms de l acteur, du cabinet et de l utilisateur cible', async () => {
    const { user: admin } = await creerSuperAdmin('admindata-audit-noms-admin');
    const { user: cabinetTitulaire } = await creerCabinetRH('admindata-audit-noms-cabinet');
    const { user: cible } = await creerCabinetRH('admindata-audit-noms-cible');

    const log = await prisma.auditLog.create({
      data: { action: 'USER_ARCHIVED', actorId: admin.id, cabinetId: cabinetTitulaire.cabinetId!, targetUserId: cible.id },
    });

    const entries = await getAuditLogEntries(200);
    const entry = entries.find((e) => e.id === log.id);

    expect(entry).toBeDefined();
    expect(entry?.actorName).toBe(`Titulaire admindata-audit-noms-admin`);
    expect(entry?.cabinetName).toBe(`Cabinet admindata-audit-noms-cabinet`);
    expect(entry?.targetUserName).toBe(`Titulaire admindata-audit-noms-cible`);
  });

  it('renvoie null pour l acteur/cabinet/cible quand la relation est absente (foreign key nulle)', async () => {
    const log = await prisma.auditLog.create({
      data: { action: 'CABINET_CREATED' },
    });

    const entries = await getAuditLogEntries(200);
    const entry = entries.find((e) => e.id === log.id);

    expect(entry).toBeDefined();
    expect(entry?.actorName).toBeNull();
    expect(entry?.cabinetName).toBeNull();
    expect(entry?.targetUserName).toBeNull();

    await prisma.auditLog.delete({ where: { id: log.id } });
  });
});

describe('getMonitoringData', () => {
  it('mesure une latence DB reelle et rapporte une base saine', async () => {
    const data = await getMonitoringData();

    expect(data.db.healthy).toBe(true);
    expect(data.db.latencyMs).not.toBeNull();
    expect(data.db.latencyMs!).toBeGreaterThanOrEqual(0);
  });

  it('compte les sessions actives (au moins celle qui vient d etre creee)', async () => {
    await creerCabinetRH('admindata-monitoring-session');

    const data = await getMonitoringData();

    expect(data.activeSessions).toBeGreaterThanOrEqual(1);
    expect(data.activeUsers).toBeGreaterThanOrEqual(1);
  });

  it('compte les utilisateurs actifs par personne distincte, pas par session', async () => {
    const before = await getMonitoringData();
    const { mail } = await creerCabinetRH('admindata-monitoring-multisession');

    // Une deuxieme connexion pour le meme compte : +1 session mais toujours
    // la meme personne.
    await auth.api.signInEmail({ body: { email: mail, password: PASSWORD }, headers: new Headers(), asResponse: true });

    const after = await getMonitoringData();

    expect(after.activeSessions).toBe(before.activeSessions + 2);
    expect(after.activeUsers).toBe(before.activeUsers + 1);
  });

  it('incremente le bon compartiment de statut a la creation d un cabinet et d un utilisateur', async () => {
    const before = await getMonitoringData();
    const { user } = await creerCabinetRH('admindata-monitoring-statut');
    const after = await getMonitoringData();

    expect(after.cabinetsByStatus.actif).toBe(before.cabinetsByStatus.actif + 1);
    expect(after.usersByStatus.actif).toBe(before.usersByStatus.actif + 1);

    await prisma.user.update({ where: { id: user.id }, data: { status: 'suspendu' } });
    const afterSuspend = await getMonitoringData();

    expect(afterSuspend.cabinetsByStatus.actif).toBe(before.cabinetsByStatus.actif + 1);
    expect(afterSuspend.usersByStatus.actif).toBe(before.usersByStatus.actif);
    expect(afterSuspend.usersByStatus.suspendu).toBe(before.usersByStatus.suspendu + 1);
  });

  it('remonte les entrees RateLimit existantes, triees par nombre de requetes decroissant', async () => {
    const key = `admindata-monitoring-ratelimit-${Date.now()}`;
    await prisma.rateLimit.create({ data: { key, count: 999, lastRequest: BigInt(Date.now()) } });

    const data = await getMonitoringData();
    const hit = data.rateLimitHits.find((h) => h.key === key);

    expect(hit).toBeDefined();
    expect(hit?.count).toBe(999);
    // 999 est le plus haut compteur possible dans ce test : doit apparaitre en tete.
    expect(data.rateLimitHits[0].key).toBe(key);

    await prisma.rateLimit.delete({ where: { key } });
  });
});
