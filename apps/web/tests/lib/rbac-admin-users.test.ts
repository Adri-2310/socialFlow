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
const { PATCH: patchUser, DELETE: deleteUser, PUT: restoreUser } = await import('@/app/api/admin/users/[id]/route');

const PASSWORD = 'InitialPass123!';
const APP_URL = 'http://localhost:3000';

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: 'Cabinet Admin Test', email: mail, password: PASSWORD }, asResponse: true }));
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { mail, cj, user };
}

async function creerSuperAdmin(label: string) {
  const { mail, cj, user } = await creerCabinetRH(label);
  // Le cabinet auto-cree n'a plus d'utilite une fois le role SuperAdmin
  // pose : cabinetId: null le rendrait sinon orphelin, invisible au
  // nettoyage afterAll (voir meme commentaire dans rbac-admin-cabinets.test.ts).
  const cabinetId = user.cabinetId!;
  await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN', cabinetId: null } });
  await prisma.cabinet.delete({ where: { id: cabinetId } });
  return { mail, cj, user };
}

function patch(userId: string, status: string, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return patchUser(
    new Request(`${APP_URL}/api/admin/users/${userId}`, { method: 'PATCH', headers, body: JSON.stringify({ status }) }),
    { params: Promise.resolve({ id: userId }) },
  );
}

function archive(userId: string, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = {};
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return deleteUser(new Request(`${APP_URL}/api/admin/users/${userId}`, { method: 'DELETE', headers }), {
    params: Promise.resolve({ id: userId }),
  });
}

function restore(userId: string, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = {};
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return restoreUser(new Request(`${APP_URL}/api/admin/users/${userId}`, { method: 'PUT', headers }), {
    params: Promise.resolve({ id: userId }),
  });
}

describe('PATCH /api/admin/users/[id] (suspension)', () => {
  it('refuse sans session', async () => {
    const { user } = await creerCabinetRH('user-patch-sans-session');
    const res = await patch(user.id, 'suspendu');
    expect(res.status).toBe(401);
  });

  it('refuse a un role autre que SUPER_ADMIN', async () => {
    const { cj } = await creerCabinetRH('user-patch-non-admin-acteur');
    const { user: cible } = await creerCabinetRH('user-patch-non-admin-cible');
    const res = await patch(cible.id, 'suspendu', cj);
    expect(res.status).toBe(403);
  });

  it('refuse un statut invalide', async () => {
    const { cj: adminCj } = await creerSuperAdmin('admin-patch-statut-invalide');
    const { user: cible } = await creerCabinetRH('cible-patch-statut-invalide');
    const res = await patch(cible.id, 'archive', adminCj);
    expect(res.status).toBe(400);
  });

  it('refuse de suspendre un SuperAdmin (y compris soi-meme)', async () => {
    const { cj: adminCj, user: admin } = await creerSuperAdmin('admin-patch-self');
    const res = await patch(admin.id, 'suspendu', adminCj);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CANNOT_SUSPEND_SUPER_ADMIN');
  });

  it('suspend un utilisateur, revoque ses sessions actives, journalise et bloque une nouvelle connexion', async () => {
    const { cj: adminCj, user: admin } = await creerSuperAdmin('admin-patch-suspend');
    const { cj: cibleCj, mail: cibleMail, user: cible } = await creerCabinetRH('cible-patch-suspend');

    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeTruthy();

    const res = await patch(cible.id, 'suspendu', adminCj);
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: cible.id } });
    expect(updated.status).toBe('suspendu');

    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeFalsy();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'USER_SUSPENDED', targetUserId: cible.id },
    });
    expect(log.actorId).toBe(admin.id);

    const connexion = await auth.api.signInEmail({
      body: { email: cibleMail, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    expect(connexion.status).toBe(403);
    expect((await connexion.json()).code).toBe('USER_SUSPENDED');
  });

  it('reactive un utilisateur, journalise et redonne acces immediatement', async () => {
    const { cj: adminCj, user: admin } = await creerSuperAdmin('admin-patch-reactive');
    const { mail: cibleMail, user: cible } = await creerCabinetRH('cible-patch-reactive');
    await patch(cible.id, 'suspendu', adminCj);

    const res = await patch(cible.id, 'actif', adminCj);
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: cible.id } });
    expect(updated.status).toBe('actif');

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'USER_REACTIVATED', targetUserId: cible.id },
    });
    expect(log.actorId).toBe(admin.id);

    const connexion = await auth.api.signInEmail({
      body: { email: cibleMail, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    expect(connexion.status).toBe(200);
  });

  it('refuse de suspendre ou reactiver un utilisateur archive', async () => {
    const { cj: adminCj } = await creerSuperAdmin('admin-patch-archive');
    const { user: cible } = await creerCabinetRH('cible-patch-archive');
    await archive(cible.id, adminCj);

    const res = await patch(cible.id, 'suspendu', adminCj);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/users/[id] (archivage)', () => {
  it('refuse sans session', async () => {
    const { user } = await creerCabinetRH('user-archive-sans-session');
    const res = await archive(user.id);
    expect(res.status).toBe(401);
  });

  it('refuse a un role autre que SUPER_ADMIN', async () => {
    const { cj } = await creerCabinetRH('user-archive-non-admin-acteur');
    const { user: cible } = await creerCabinetRH('user-archive-non-admin-cible');
    const res = await archive(cible.id, cj);
    expect(res.status).toBe(403);
  });

  it('refuse d archiver un SuperAdmin (y compris soi-meme)', async () => {
    const { cj: adminCj, user: admin } = await creerSuperAdmin('admin-archive-self');
    const { user: admin2 } = await creerSuperAdmin('admin-archive-autre');

    const resSelf = await archive(admin.id, adminCj);
    expect(resSelf.status).toBe(400);
    expect((await resSelf.json()).error).toBe('CANNOT_ARCHIVE_SUPER_ADMIN');

    const resAutre = await archive(admin2.id, adminCj);
    expect(resAutre.status).toBe(400);
  });

  it('archive un utilisateur, revoque ses sessions actives, journalise et bloque une nouvelle connexion', async () => {
    const { cj: adminCj, user: admin } = await creerSuperAdmin('admin-archive-user');
    const { cj: cibleCj, mail: cibleMail, user: cible } = await creerCabinetRH('cible-archive-user');

    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeTruthy();

    const res = await archive(cible.id, adminCj);
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: cible.id } });
    expect(updated.deletedAt).not.toBeNull();

    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeFalsy();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'USER_ARCHIVED', targetUserId: cible.id },
    });
    expect(log.actorId).toBe(admin.id);

    const connexion = await auth.api.signInEmail({
      body: { email: cibleMail, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    expect(connexion.status).toBe(401);
    expect((await connexion.json()).code).toBe('INVALID_EMAIL_OR_PASSWORD');
  });

  it('refuse d archiver un utilisateur deja archive', async () => {
    const { cj: adminCj } = await creerSuperAdmin('admin-double-archive-user');
    const { user: cible } = await creerCabinetRH('cible-double-archive-user');
    await archive(cible.id, adminCj);

    const res = await archive(cible.id, adminCj);
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/admin/users/[id] (restauration)', () => {
  it('refuse sans session', async () => {
    const { user } = await creerCabinetRH('user-restore-sans-session');
    const res = await restore(user.id);
    expect(res.status).toBe(401);
  });

  it('refuse a un role autre que SUPER_ADMIN', async () => {
    const { cj } = await creerCabinetRH('user-restore-non-admin-acteur');
    const { user: cible } = await creerCabinetRH('user-restore-non-admin-cible');
    const res = await restore(cible.id, cj);
    expect(res.status).toBe(403);
  });

  it("refuse de restaurer un utilisateur qui n'est pas archive", async () => {
    const { cj: adminCj } = await creerSuperAdmin('admin-restore-non-archive-user');
    const { user: cible } = await creerCabinetRH('cible-restore-non-archive-user');

    const res = await restore(cible.id, adminCj);
    expect(res.status).toBe(400);
  });

  it('restaure l utilisateur, journalise et redonne acces immediatement', async () => {
    const { cj: adminCj, user: admin } = await creerSuperAdmin('admin-restore-user');
    const { mail: cibleMail, user: cible } = await creerCabinetRH('cible-restore-user');
    await archive(cible.id, adminCj);

    const res = await restore(cible.id, adminCj);
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: cible.id } });
    expect(updated.deletedAt).toBeNull();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'USER_RESTORED', targetUserId: cible.id },
    });
    expect(log.actorId).toBe(admin.id);

    const connexion = await auth.api.signInEmail({
      body: { email: cibleMail, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    expect(connexion.status).toBe(200);
  });
});
