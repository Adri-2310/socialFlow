// @vitest-environment node
import crypto from 'node:crypto';
import { describe, it, expect, vi, afterAll } from 'vitest';
import { cookieJar, testEmail, totpCode, TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

vi.mock('@/lib/email', () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  sendOTPEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendChangeEmailConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendResetPasswordEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletedEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const email = await import('@/lib/email');

const PASSWORD = 'InitialPass123!';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: {
      OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }],
    },
  });
});

/** Cree un compte et lui attache un faux compte OAuth (pas d'appel reseau). */
async function creerCompteAvecOAuth(label: string, providerId: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  await prisma.account.create({
    data: { id: crypto.randomUUID(), providerId, accountId: `${providerId}-${user.id}`, userId: user.id },
  });
  return { mail, cj, user };
}

describe('deliaison de comptes', () => {
  it("refuse de supprimer l'unique methode de connexion", async () => {
    const mail = testEmail('unlink-dernier');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    // Le compte n'a que sa ligne `credential` : la delier laisserait
    // l'utilisateur sans aucun moyen de se connecter.
    const res = await auth.api.unlinkAccount({ body: { providerId: 'credential' }, headers: cj.headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('FAILED_TO_UNLINK_LAST_ACCOUNT');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    expect(await prisma.account.count({ where: { userId: user.id, providerId: 'credential' } })).toBe(1);
  });

  it("refuse de delier un fournisseur qui n'est pas rattache au compte", async () => {
    const { cj } = await creerCompteAvecOAuth('unlink-absent', 'google');

    const res = await auth.api.unlinkAccount({ body: { providerId: 'microsoft' }, headers: cj.headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('notifie par email avec le libelle du fournisseur', async () => {
    const { mail, cj } = await creerCompteAvecOAuth('unlink-microsoft', 'microsoft');

    const res = await auth.api.unlinkAccount({ body: { providerId: 'microsoft' }, headers: cj.headers(), asResponse: true });

    expect(res.status).toBe(200);
    expect(email.sendAccountUnlinkedEmail).toHaveBeenCalledWith(mail, 'Microsoft');
  });

  it("retombe sur l'identifiant brut pour un fournisseur sans libelle connu", async () => {
    const { mail, cj } = await creerCompteAvecOAuth('unlink-inconnu', 'linkedin');

    // OAUTH_PROVIDER_LABELS (auth.ts) ne connait que google et microsoft :
    // on verifie que le repli n'envoie pas un email vide ou "undefined".
    const res = await auth.api.unlinkAccount({ body: { providerId: 'linkedin' }, headers: cj.headers(), asResponse: true });

    expect(res.status).toBe(200);
    expect(email.sendAccountUnlinkedEmail).toHaveBeenCalledWith(mail, 'linkedin');
  });
});

describe('fournisseurs OAuth configures', () => {
  it("construit une URL d'autorisation Google avec PKCE et le bon callback", async () => {
    const res = await auth.api.signInSocial({
      body: { provider: 'google', disableRedirect: true, callbackURL: '/dashboard' },
      headers: new Headers(),
      asResponse: true,
    });
    const body = await res.json();
    const url = new URL(body.url);

    expect(res.status).toBe(200);
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('redirect_uri')).toContain('/api/auth/callback/google');
  });

  it("construit une URL d'autorisation Microsoft avec PKCE et le bon callback", async () => {
    const res = await auth.api.signInSocial({
      body: { provider: 'microsoft', disableRedirect: true },
      headers: new Headers(),
      asResponse: true,
    });
    const body = await res.json();
    const url = new URL(body.url);

    expect(res.status).toBe(200);
    expect(url.origin).toBe('https://login.microsoftonline.com');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toContain('/api/auth/callback/microsoft');
  });

  it('refuse un fournisseur non configure', async () => {
    const res = await auth.api.signInSocial({
      body: { provider: 'github', disableRedirect: true },
      headers: new Headers(),
      asResponse: true,
    } as never);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('PROVIDER_NOT_FOUND');
  });

  it("rejette un retour OAuth dont le state est forge et redirige vers la page d'erreur", async () => {
    const res = await auth.api.callbackOAuth({
      params: { id: 'google' },
      query: { state: 'state-forge-par-un-attaquant', code: 'code-bidon' },
      headers: new Headers(),
      asResponse: true,
    } as never);

    // Le state est le garde-fou anti-CSRF du flux OAuth ; l'URL de repli
    // provient de `onAPIError.errorURL` dans auth.ts.
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/erreur-connexion');
    expect(res.headers.get('location')).toContain('state_mismatch');
  });
});

describe('suppression de compte', () => {
  it('refuse la suppression avec un mauvais mot de passe', async () => {
    const mail = testEmail('delete-mdp');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    const res = await auth.api.deleteUser({ body: { password: 'MauvaisPass123!' }, headers: cj.headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_PASSWORD');
    expect(await prisma.user.findUnique({ where: { email: mail } })).not.toBeNull();
  });

  it('refuse la suppression sans session', async () => {
    const res = await auth.api.deleteUser({ body: { password: PASSWORD }, headers: new Headers(), asResponse: true });

    expect(res.status).toBe(401);
  });

  it('supprime en cascade sessions, comptes lies et secret 2FA', async () => {
    const mail = testEmail('delete-cascade');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'A Supprimer', email: mail, password: PASSWORD }, asResponse: true }));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });

    await prisma.account.create({
      data: { id: crypto.randomUUID(), providerId: 'google', accountId: `google-${user.id}`, userId: user.id },
    });
    const enable = await auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true });
    const secret = new URL((await enable.json()).totpURI).searchParams.get('secret') as string;
    cj.apply(await auth.api.verifyTOTP({ body: { code: totpCode(secret) }, headers: cj.headers(), asResponse: true }));
    await auth.api.sendVerificationOTP({ body: { email: mail, type: 'sign-in' }, headers: new Headers(), asResponse: true });

    expect(await prisma.session.count({ where: { userId: user.id } })).toBeGreaterThan(0);
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(2);
    expect(await prisma.twoFactor.count({ where: { userId: user.id } })).toBe(1);

    const res = await auth.api.deleteUser({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true });
    expect(res.status).toBe(200);

    // Session, Account et TwoFactor ont `onDelete: Cascade` vers User dans
    // schema.prisma : rien ne survit a la suppression du compte.
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.twoFactor.count({ where: { userId: user.id } })).toBe(0);

    // En revanche la table Verification n'a aucune cle etrangere vers User :
    // ses lignes restent orphelines jusqu'a leur expiration. Elles ne
    // contiennent pas de donnee exploitable (le compte cible n'existe plus),
    // mais ce test documente le comportement reel plutot que de le supposer.
    expect(await prisma.verification.count({ where: { identifier: `sign-in-otp-${mail}` } })).toBe(1);
  });
});
