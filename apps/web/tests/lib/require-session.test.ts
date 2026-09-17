// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
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

// `redirect()` de next/navigation ne peut pas s'executer hors d'un rendu
// Next.js reel (il lance une erreur speciale interceptee par le framework) :
// on la remplace par une erreur ordinaire portant l'URL, pour verifier ou
// requireSession redirige sans avoir besoin d'un vrai rendu de page.
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

// requireSession lit `headers()` de next/headers, disponible uniquement
// dans une vraie requete Next.js - remplace par un Headers() controle par le
// test, comme le ferait la requete HTTP entrante.
let currentHeaders = new Headers();
vi.mock('next/headers', () => ({
  headers: async () => currentHeaders,
}));

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const { requireSession } = await import('@/lib/require-session');

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
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

/** Cree un Cabinet RH (auto-inscription) et renvoie son cookie jar. */
async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: 'Cabinet Admin Test', email: mail, password: PASSWORD }, asResponse: true }));
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { cj, user };
}

/** Cree un compte puis le force au role SUPER_ADMIN. */
async function creerSuperAdmin(label: string) {
  const { cj, user } = await creerCabinetRH(label);
  const cabinetId = user.cabinetId!;
  await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN', cabinetId: null } });
  await prisma.cabinet.delete({ where: { id: cabinetId } });
  return { cj, user };
}

beforeEach(() => {
  redirectMock.mockClear();
  currentHeaders = new Headers();
});

describe('requireSession', () => {
  it('redirige vers /login sans session', async () => {
    await expect(requireSession()).rejects.toThrow('REDIRECT:/login');
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('redirige vers l URL personnalisee fournie via redirectTo', async () => {
    await expect(requireSession({ redirectTo: '/custom-login' })).rejects.toThrow('REDIRECT:/custom-login');
  });

  it('redirige vers /dashboard quand le role ne correspond pas', async () => {
    const { cj } = await creerCabinetRH('require-session-mauvais-role');
    currentHeaders = cj.headers();

    await expect(requireSession({ role: 'SUPER_ADMIN' })).rejects.toThrow('REDIRECT:/dashboard');
  });

  it('retourne la session sans verification de role si aucun n est demande', async () => {
    const { cj, user } = await creerCabinetRH('require-session-sans-role');
    currentHeaders = cj.headers();

    const session = await requireSession();
    expect(session.user.id).toBe(user.id);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('retourne la session quand le role correspond', async () => {
    const { cj, user } = await creerSuperAdmin('require-session-bon-role');
    currentHeaders = cj.headers();

    const session = await requireSession({ role: 'SUPER_ADMIN' });
    expect(session.user.id).toBe(user.id);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('accepte un tableau de roles autorises', async () => {
    const { cj, user } = await creerSuperAdmin('require-session-tableau-roles');
    currentHeaders = cj.headers();

    const session = await requireSession({ role: ['GESTIONNAIRE_RH', 'SUPER_ADMIN'] });
    expect(session.user.id).toBe(user.id);
  });
});
