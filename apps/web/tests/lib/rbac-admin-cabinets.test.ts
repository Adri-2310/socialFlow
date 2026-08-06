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
const { PATCH: patchCabinet } = await import('@/app/api/admin/cabinets/[id]/route');

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

/** Cree un Cabinet RH (auto-inscription) et renvoie son cookie jar + son cabinetId. */
async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: 'Cabinet Admin Test', email: mail, password: PASSWORD }, asResponse: true }));
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { mail, cj, user };
}

/** Cree un compte puis le force au role SUPER_ADMIN (jamais pose par l'inscription elle-meme). */
async function creerSuperAdmin(label: string) {
  const { mail, cj, user } = await creerCabinetRH(label);
  await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN', cabinetId: null } });
  return { mail, cj, user };
}

function requestPATCH(url: string, body: unknown, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return new Request(url, { method: 'PATCH', headers, body: JSON.stringify(body) });
}

function patch(cabinetId: string, status: string, cj?: ReturnType<typeof cookieJar>) {
  return patchCabinet(requestPATCH(`${APP_URL}/api/admin/cabinets/${cabinetId}`, { status }, cj), {
    params: Promise.resolve({ id: cabinetId }),
  });
}

describe('inscription : journal d audit', () => {
  it("l'auto-inscription d'un Cabinet RH cree une entree CABINET_CREATED", async () => {
    const { user } = await creerCabinetRH('cabinet-audit-creation');
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CABINET_CREATED', cabinetId: user.cabinetId! },
    });
    expect(log.actorId).toBe(user.id);
  });
});

describe('PATCH /api/admin/cabinets/[id]', () => {
  it('refuse sans session', async () => {
    const { user } = await creerCabinetRH('cible-sans-session');
    const res = await patch(user.cabinetId!, 'suspendu');
    expect(res.status).toBe(401);
  });

  it("refuse a un role autre que SUPER_ADMIN", async () => {
    const { cj, user } = await creerCabinetRH('non-admin');
    const res = await patch(user.cabinetId!, 'suspendu', cj);
    expect(res.status).toBe(403);
  });

  it('refuse un statut invalide', async () => {
    const { cj: adminCj } = await creerSuperAdmin('admin-statut-invalide');
    const { user: cible } = await creerCabinetRH('cible-statut-invalide');
    const res = await patch(cible.cabinetId!, 'archive', adminCj);
    expect(res.status).toBe(400);
  });

  it('suspend le cabinet, revoque les sessions actives et journalise', async () => {
    const { cj: adminCj, user: admin } = await creerSuperAdmin('admin-suspend');
    const { cj: cibleCj, user: cible } = await creerCabinetRH('cible-suspend');

    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeTruthy();

    const res = await patch(cible.cabinetId!, 'suspendu', adminCj);
    expect(res.status).toBe(200);

    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: cible.cabinetId! } });
    expect(cabinet.status).toBe('suspendu');

    // La session ouverte avant la suspension est coupee immediatement.
    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeFalsy();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CABINET_SUSPENDED', cabinetId: cible.cabinetId! },
    });
    expect(log.actorId).toBe(admin.id);
  });

  it('bloque une nouvelle connexion par mot de passe sur un cabinet suspendu', async () => {
    const { cj: adminCj } = await creerSuperAdmin('admin-bloque-mdp');
    const { mail: cibleMail, user: cible } = await creerCabinetRH('cible-bloque-mdp');
    await patch(cible.cabinetId!, 'suspendu', adminCj);

    const res = await auth.api.signInEmail({
      body: { email: cibleMail, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('INVALID_EMAIL_OR_PASSWORD');
  });

  it('bloque une nouvelle connexion par lien magique sur un cabinet suspendu, avec redirection dediee', async () => {
    const { cj: adminCj } = await creerSuperAdmin('admin-bloque-lien');
    const { mail: cibleMail, user: cible } = await creerCabinetRH('cible-bloque-lien');
    await patch(cible.cabinetId!, 'suspendu', adminCj);

    await auth.api.signInMagicLink({
      body: { email: cibleMail, callbackURL: '/bienvenue' },
      headers: new Headers(),
      asResponse: true,
    });
    const verification = await prisma.verification.findFirstOrThrow({
      where: { value: { contains: cibleMail } },
      orderBy: { createdAt: 'desc' },
    });

    const res = await auth.api.magicLinkVerify({
      query: { token: verification.identifier, callbackURL: '/bienvenue' },
      headers: new Headers(),
      asResponse: true,
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=cabinet_suspended');
  });

  it('reactive le cabinet, journalise et redonne acces immediatement', async () => {
    const { cj: adminCj, user: admin } = await creerSuperAdmin('admin-reactive');
    const { mail: cibleMail, user: cible } = await creerCabinetRH('cible-reactive');
    await patch(cible.cabinetId!, 'suspendu', adminCj);

    const res = await patch(cible.cabinetId!, 'actif', adminCj);
    expect(res.status).toBe(200);

    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: cible.cabinetId! } });
    expect(cabinet.status).toBe('actif');

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CABINET_REACTIVATED', cabinetId: cible.cabinetId! },
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
