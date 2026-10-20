// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
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

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const { requireSession } = await import('@/lib/auth/require-session');

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

beforeEach(() => {
  redirectMock.mockClear();
  currentHeaders = new Headers();
});

// Seule la presence d'une session est controlee ici : les decisions d'acces par
// role (et la 2FA du SuperAdmin) sont celles de requireAuthorized, voir
// authz-page.test.ts.
describe('requireSession', () => {
  it('redirige vers /login sans session', async () => {
    await expect(requireSession()).rejects.toThrow('REDIRECT:/login');
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('redirige vers l URL personnalisee fournie via redirectTo', async () => {
    await expect(requireSession({ redirectTo: '/custom-login' })).rejects.toThrow('REDIRECT:/custom-login');
  });

  it('retourne la session de l utilisateur connecte, quel que soit son role', async () => {
    const { cj, user } = await creerCabinetRH('require-session-connecte');
    currentHeaders = cj.headers();

    const session = await requireSession();
    expect(session.user.id).toBe(user.id);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
