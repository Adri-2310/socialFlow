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
const { PATCH: patchCabinet, DELETE: deleteCabinet, PUT: restoreCabinet } = await import(
  '@/app/api/admin/cabinets/[id]/route'
);
const { CABINET_DELETION_RETENTION_DAYS } = await import('@/lib/cabinet-retention');

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
  // Le cabinet auto-cree par l'inscription (voir hooks.after de auth.ts)
  // n'a plus d'utilite une fois le role SuperAdmin pose : cabinetId: null
  // le rendrait sinon orphelin, invisible au nettoyage afterAll qui ne
  // retrouve les cabinets de test que via le cabinetId des utilisateurs.
  // Detache d'abord (sinon supprimer le cabinet cascaderait sur le User
  // lui-meme, via onDelete: Cascade sur User.cabinetId).
  const cabinetId = user.cabinetId!;
  await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN', cabinetId: null } });
  await prisma.cabinet.delete({ where: { id: cabinetId } });
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

function archive(cabinetId: string, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = {};
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return deleteCabinet(new Request(`${APP_URL}/api/admin/cabinets/${cabinetId}`, { method: 'DELETE', headers }), {
    params: Promise.resolve({ id: cabinetId }),
  });
}

function restore(cabinetId: string, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = {};
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return restoreCabinet(new Request(`${APP_URL}/api/admin/cabinets/${cabinetId}`, { method: 'PUT', headers }), {
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

  it('bloque une nouvelle connexion par mot de passe sur un cabinet suspendu avec un message explicite', async () => {
    const { cj: adminCj } = await creerSuperAdmin('admin-bloque-mdp');
    const { mail: cibleMail, user: cible } = await creerCabinetRH('cible-bloque-mdp');
    await patch(cible.cabinetId!, 'suspendu', adminCj);

    const res = await auth.api.signInEmail({
      body: { email: cibleMail, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    // Pas de non-divulgation ici (choix produit) : contrairement a un email
    // inconnu ou un compte archive, l'utilisateur doit savoir explicitement
    // que son cabinet est suspendu plutot que de croire a un mauvais mot de
    // passe (voir redirection cote client dans login-form.tsx).
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('CABINET_SUSPENDED');
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

describe('DELETE /api/admin/cabinets/[id] (archivage)', () => {
  it('refuse sans session', async () => {
    const { user } = await creerCabinetRH('archive-sans-session');
    const res = await archive(user.cabinetId!);
    expect(res.status).toBe(401);
  });

  it("refuse a un role autre que SUPER_ADMIN", async () => {
    const { cj, user } = await creerCabinetRH('archive-non-admin');
    const res = await archive(user.cabinetId!, cj);
    expect(res.status).toBe(403);
  });

  it('archive le cabinet, revoque les sessions actives, journalise et bloque une nouvelle connexion', async () => {
    const { cj: adminCj, user: admin } = await creerSuperAdmin('admin-archive');
    const { cj: cibleCj, mail: cibleMail, user: cible } = await creerCabinetRH('cible-archive');

    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeTruthy();

    const res = await archive(cible.cabinetId!, adminCj);
    expect(res.status).toBe(200);

    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: cible.cabinetId! } });
    expect(cabinet.deletedAt).not.toBeNull();
    // Le statut sous-jacent n'est pas touche par l'archivage : deletedAt est
    // le seul signal, verifie separement (voir hooks.after de auth.ts).
    expect(cabinet.status).toBe('actif');

    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeFalsy();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CABINET_ARCHIVED', cabinetId: cible.cabinetId! },
    });
    expect(log.actorId).toBe(admin.id);

    const connexion = await auth.api.signInEmail({
      body: { email: cibleMail, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    expect(connexion.status).toBe(403);
    expect((await connexion.json()).code).toBe('CABINET_SUSPENDED');
  });

  it('refuse d archiver un cabinet deja archive', async () => {
    const { cj: adminCj } = await creerSuperAdmin('admin-double-archive');
    const { user: cible } = await creerCabinetRH('cible-double-archive');
    await archive(cible.cabinetId!, adminCj);

    const res = await archive(cible.cabinetId!, adminCj);
    expect(res.status).toBe(400);
  });

  it('refuse de suspendre ou reactiver un cabinet archive', async () => {
    const { cj: adminCj } = await creerSuperAdmin('admin-patch-archive');
    const { user: cible } = await creerCabinetRH('cible-patch-archive');
    await archive(cible.cabinetId!, adminCj);

    const res = await patch(cible.cabinetId!, 'suspendu', adminCj);
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/admin/cabinets/[id] (restauration)', () => {
  it('refuse sans session', async () => {
    const { user } = await creerCabinetRH('restore-sans-session');
    const res = await restore(user.cabinetId!);
    expect(res.status).toBe(401);
  });

  it("refuse a un role autre que SUPER_ADMIN", async () => {
    const { cj, user } = await creerCabinetRH('restore-non-admin');
    const res = await restore(user.cabinetId!, cj);
    expect(res.status).toBe(403);
  });

  it("refuse de restaurer un cabinet qui n'est pas archive", async () => {
    const { cj: adminCj } = await creerSuperAdmin('admin-restore-non-archive');
    const { user: cible } = await creerCabinetRH('cible-restore-non-archive');

    const res = await restore(cible.cabinetId!, adminCj);
    expect(res.status).toBe(400);
  });

  it('restaure le cabinet, journalise et redonne acces immediatement', async () => {
    const { cj: adminCj, user: admin } = await creerSuperAdmin('admin-restore');
    const { mail: cibleMail, user: cible } = await creerCabinetRH('cible-restore');
    await archive(cible.cabinetId!, adminCj);

    const res = await restore(cible.cabinetId!, adminCj);
    expect(res.status).toBe(200);

    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: cible.cabinetId! } });
    expect(cabinet.deletedAt).toBeNull();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CABINET_RESTORED', cabinetId: cible.cabinetId! },
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

describe('purge definitive des cabinets archives (cron)', () => {
  it('refuse une requete sans le bon secret', async () => {
    const { GET } = await import('@/app/api/cron/purge-deleted-cabinets/route');
    const res = await GET(new Request('http://localhost/api/cron/purge-deleted-cabinets'));
    expect(res.status).toBe(401);
  });

  it('purge les cabinets archives depuis plus que le delai de retention (et leurs utilisateurs en cascade), laisse les recents intacts', async () => {
    const { cj: adminCj } = await creerSuperAdmin('admin-purge-cron');
    const { user: cibleAncien } = await creerCabinetRH('purge-cron-ancien');
    const { mail: mailRecent } = await creerCabinetRH('purge-cron-recent');

    await archive(cibleAncien.cabinetId!, adminCj);
    // Recule artificiellement la date d'archivage, plutot que d'attendre
    // CABINET_DELETION_RETENTION_DAYS jours dans le test.
    await prisma.cabinet.update({
      where: { id: cibleAncien.cabinetId! },
      data: { deletedAt: new Date(Date.now() - (CABINET_DELETION_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000) },
    });

    const { GET } = await import('@/app/api/cron/purge-deleted-cabinets/route');
    const res = await GET(
      new Request('http://localhost/api/cron/purge-deleted-cabinets', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).purged).toBeGreaterThanOrEqual(1);

    expect(await prisma.cabinet.findUnique({ where: { id: cibleAncien.cabinetId! } })).toBeNull();
    // User.cabinetId a onDelete: Cascade : l'utilisateur du cabinet purge disparait avec lui.
    expect(await prisma.user.findUnique({ where: { id: cibleAncien.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: mailRecent } })).not.toBeNull();
  });
});
