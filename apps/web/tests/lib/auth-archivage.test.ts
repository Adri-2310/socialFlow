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

const PASSWORD = 'InitialPass123!';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: {
      OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }],
    },
  });
});

/** Cree un compte puis suit le flux complet de demande + confirmation de suppression (donc archivage). */
async function archiverCompte(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));
  await auth.api.deleteUser({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true });

  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  const verification = await prisma.verification.findFirstOrThrow({
    where: { value: user.id, identifier: { startsWith: 'delete-account-' } },
    orderBy: { createdAt: 'desc' },
  });
  const token = verification.identifier.replace('delete-account-', '');
  await auth.api.deleteUserCallback({ query: { token }, headers: cj.headers(), asResponse: true });

  return { mail, user };
}

describe('archivage : blocage de connexion', () => {
  it('bloque la connexion par mot de passe sur un compte archive (indiscernable d un mauvais mot de passe)', async () => {
    const { mail } = await archiverCompte('archive-mdp');

    const res = await auth.api.signInEmail({
      body: { email: mail, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('INVALID_EMAIL_OR_PASSWORD');
  });

  it('bloque la connexion par lien magique sur un compte archive', async () => {
    const { mail } = await archiverCompte('archive-lien');

    await auth.api.signInMagicLink({
      body: { email: mail, callbackURL: '/bienvenue' },
      headers: new Headers(),
      asResponse: true,
    });
    const verification = await prisma.verification.findFirstOrThrow({
      where: { value: { contains: mail } },
      orderBy: { createdAt: 'desc' },
    });

    const res = await auth.api.magicLinkVerify({
      query: { token: verification.identifier, callbackURL: '/bienvenue' },
      headers: new Headers(),
      asResponse: true,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=account_deleted');

    const cj = cookieJar();
    cj.apply(res);
    expect(await auth.api.getSession({ headers: cj.headers() })).toBeFalsy();
  });

  it('bloque la connexion par code email sur un compte archive', async () => {
    const { mail } = await archiverCompte('archive-otp');

    await auth.api.sendVerificationOTP({ body: { email: mail, type: 'sign-in' }, headers: new Headers(), asResponse: true });
    const verification = await prisma.verification.findFirstOrThrow({
      where: { identifier: `sign-in-otp-${mail}` },
      orderBy: { createdAt: 'desc' },
    });
    const code = verification.value.split(':')[0];

    const res = await auth.api.signInEmailOTP({
      body: { email: mail, otp: code },
      headers: new Headers(),
      asResponse: true,
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ACCOUNT_DELETED');
  });
});

describe('archivage : restauration', () => {
  it("redonne acces des que deletedAt est efface (ce que fait scripts/restore-account.ts)", async () => {
    const { mail, user } = await archiverCompte('archive-restaure');

    const refuse = await auth.api.signInEmail({
      body: { email: mail, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    expect(refuse.status).toBe(401);

    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: null } });

    const cj = cookieJar();
    const res = await auth.api.signInEmail({
      body: { email: mail, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    cj.apply(res);
    expect(res.status).toBe(200);
    expect((await auth.api.getSession({ headers: cj.headers() }))?.user.email).toBe(mail);
  });
});

describe('purge definitive des comptes archives (cron)', () => {
  it('refuse une requete sans le bon secret', async () => {
    const { GET } = await import('@/app/api/cron/purge-deleted-accounts/route');
    const res = await GET(new Request('http://localhost/api/cron/purge-deleted-accounts'));
    expect(res.status).toBe(401);
  });

  it('purge les comptes archives depuis plus de 30 jours, laisse les recents intacts', async () => {
    const { user: userAncien } = await archiverCompte('purge-ancien');
    const { mail: mailRecent } = await archiverCompte('purge-recent');

    // Recule artificiellement la date d'archivage du premier compte, plutot
    // que d'attendre 30 jours dans le test.
    await prisma.user.update({
      where: { id: userAncien.id },
      data: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });

    const { GET } = await import('@/app/api/cron/purge-deleted-accounts/route');
    const res = await GET(
      new Request('http://localhost/api/cron/purge-deleted-accounts', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).purged).toBeGreaterThanOrEqual(1);

    expect(await prisma.user.findUnique({ where: { id: userAncien.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: mailRecent } })).not.toBeNull();
  });
});
