// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { cookieJar, testEmail, TEST_EMAIL_PREFIX } from '../../helpers/auth-test-utils';

vi.mock('@/lib/email/email', () => ({
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

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const { sendResetPasswordEmail } = await import('@/lib/email/email');
const { createSuperAdmin, BootstrapError } = await import('@/lib/auth/superadmin-bootstrap');

const PASSWORD = 'InitialPass123!';
const NEW_PASSWORD = 'ChoisiParLeTitulaire456!';

// La base de dev peut contenir un vrai SuperAdmin : on ne le touche jamais. Le
// contrôle « existe-t-il déjà un SuperAdmin ? » est simulé (aucun) pour tous les
// tests ; celui du refus le rétablit et crée lui-même un SuperAdmin de test.
const realCount = prisma.user.count.bind(prisma.user);
let countSpy: ReturnType<typeof vi.spyOn>;

function simulerAucunSuperAdmin() {
  countSpy = vi.spyOn(prisma.user, 'count').mockImplementation(((args?: { where?: { role?: string } }) =>
    args?.where?.role === 'SUPER_ADMIN' ? Promise.resolve(0) : realCount(args as never)) as never);
}

async function supprimerTests() {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { id: true, cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ cabinetId: { in: cabinetIds } }, { targetUserId: { in: testUsers.map((u) => u.id) } }] },
  });
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
}

function tokenDuLien(lien: string) {
  return new URL(lien).pathname.split('/').pop()!;
}

beforeEach(async () => {
  vi.mocked(sendResetPasswordEmail).mockReset().mockResolvedValue(undefined);
  await supprimerTests();
  simulerAucunSuperAdmin();
});
afterEach(() => countSpy.mockRestore());
afterAll(supprimerTests);

describe('createSuperAdmin (D18)', () => {
  it('crée un SuperAdmin sans cabinet ni mot de passe, journalise et envoie le lien', async () => {
    const email = testEmail('bootstrap-ok');
    const res = await createSuperAdmin({ email, name: 'Adrien Mertens' });
    expect(res.status).toBe('created');

    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { accounts: true } });
    expect(user).toMatchObject({
      id: res.userId,
      name: 'Adrien Mertens',
      role: 'SUPER_ADMIN',
      cabinetId: null,
      emailVerified: true,
      status: 'actif',
    });
    expect(user.accounts).toHaveLength(0);

    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(1);
    const [destinataire, lien] = vi.mocked(sendResetPasswordEmail).mock.calls[0];
    expect(destinataire).toBe(email);
    expect(lien).toContain('/reset-password/');
    expect(decodeURIComponent(lien)).toContain('callbackURL=/reinitialiser-mot-de-passe');

    const verification = await prisma.verification.findFirstOrThrow({
      where: { identifier: { startsWith: 'reset-password:' }, value: user.id },
    });
    expect(verification.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'SUPERADMIN_BOOTSTRAPPED', targetUserId: user.id },
    });
    expect(audit.actorId).toBeNull();
    expect(audit.metadata).toEqual({ force: false });
  });

  it('nomme le compte « SuperAdmin » sans nom donné et met l’adresse en minuscules', async () => {
    const email = testEmail('bootstrap-defaut');
    await createSuperAdmin({ email: `  ${email.toUpperCase()}  ` });

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.name).toBe('SuperAdmin');
  });

  it('le lien reçu permet de définir un mot de passe puis de se connecter', async () => {
    const email = testEmail('bootstrap-parcours');
    await createSuperAdmin({ email });

    const token = tokenDuLien(vi.mocked(sendResetPasswordEmail).mock.calls[0][1]);
    const reset = await auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } });
    expect(reset.status).toBe(true);

    const cj = cookieJar();
    const connexion = await auth.api.signInEmail({
      body: { email, password: NEW_PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    cj.apply(connexion);
    expect(connexion.status).toBe(200);
    const session = await auth.api.getSession({ headers: cj.headers() });
    expect(session?.user.role).toBe('SUPER_ADMIN');
  });

  it('refuse une adresse invalide', async () => {
    await expect(createSuperAdmin({ email: 'pas-un-email' })).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
    expect(sendResetPasswordEmail).not.toHaveBeenCalled();
  });

  it('refuse quand un SuperAdmin existe déjà, sans rien créer', async () => {
    countSpy.mockRestore();
    await createSuperAdmin({ email: testEmail('bootstrap-premier'), force: true });
    vi.mocked(sendResetPasswordEmail).mockClear();

    const email = testEmail('bootstrap-second');
    const echec = createSuperAdmin({ email });
    await expect(echec).rejects.toBeInstanceOf(BootstrapError);
    await expect(echec).rejects.toMatchObject({ code: 'SUPER_ADMIN_EXISTS' });
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    expect(sendResetPasswordEmail).not.toHaveBeenCalled();
  });

  it('crée un SuperAdmin supplémentaire avec force et le note dans l’audit', async () => {
    countSpy.mockRestore();
    await createSuperAdmin({ email: testEmail('bootstrap-force-1'), force: true });

    const res = await createSuperAdmin({ email: testEmail('bootstrap-force-2'), force: true });
    expect(res.status).toBe('created');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'SUPERADMIN_BOOTSTRAPPED', targetUserId: res.userId },
    });
    expect(audit.metadata).toEqual({ force: true });
  });

  it('refuse une adresse déjà utilisée par un autre rôle, même avec force, sans la promouvoir', async () => {
    const mail = testEmail('bootstrap-pris');
    await auth.api.signUpEmail({ body: { name: 'Cabinet', email: mail, password: PASSWORD } });

    await expect(createSuperAdmin({ email: mail, force: true })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    expect(user.role).toBe('CABINET_RH');
    expect(sendResetPasswordEmail).not.toHaveBeenCalled();
  });

  it('est idempotent : un SuperAdmin prêt à se connecter n’est pas modifié', async () => {
    const email = testEmail('bootstrap-idempotent');
    const { userId } = await createSuperAdmin({ email });
    const token = tokenDuLien(vi.mocked(sendResetPasswordEmail).mock.calls[0][1]);
    await auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } });
    vi.mocked(sendResetPasswordEmail).mockClear();

    const res = await createSuperAdmin({ email });
    expect(res).toEqual({ status: 'unchanged', userId });
    expect(sendResetPasswordEmail).not.toHaveBeenCalled();
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('renvoie le lien à un SuperAdmin qui n’a pas encore de mot de passe', async () => {
    const email = testEmail('bootstrap-renvoi');
    const { userId } = await createSuperAdmin({ email });
    vi.mocked(sendResetPasswordEmail).mockClear();

    const res = await createSuperAdmin({ email });
    expect(res).toEqual({ status: 'resent', userId });
    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(1);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'SUPERADMIN_BOOTSTRAPPED', targetUserId: userId } })).toBe(2);
  });

  it('signale un échec d’envoi, garde le compte et permet de renvoyer le lien', async () => {
    const email = testEmail('bootstrap-echec-envoi');
    vi.mocked(sendResetPasswordEmail).mockRejectedValueOnce(new Error('Resend indisponible'));

    await expect(createSuperAdmin({ email })).rejects.toMatchObject({ code: 'EMAIL_SEND_FAILED' });
    expect(await prisma.user.count({ where: { email } })).toBe(1);

    const res = await createSuperAdmin({ email });
    expect(res.status).toBe('resent');
  });
});
