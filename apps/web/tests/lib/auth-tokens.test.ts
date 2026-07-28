// @vitest-environment node
import { describe, it, expect, vi, afterAll } from 'vitest';
import { SignJWT } from 'jose';
import { testEmail, TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

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

const PASSWORD = 'InitialPass123!';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: {
      OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }],
    },
  });
});

/**
 * Variante de `makeEmailVerificationJWT` permettant de choisir la date
 * d'expiration et la cle de signature, pour fabriquer les cas limites
 * (jeton perime, jeton signe par un attaquant) qu'un flux normal ne produit
 * jamais.
 */
async function signerJeton(
  payload: Record<string, string>,
  { expiresIn = 3600, secret = process.env.BETTER_AUTH_SECRET as string } = {},
): Promise<string> {
  const maintenant = Math.floor(Date.now() / 1000);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(maintenant - 1)
    .setExpirationTime(maintenant + expiresIn)
    .sign(new TextEncoder().encode(secret));
}

/** Cree un compte et renvoie le jeton de reinitialisation stocke en base. */
async function demanderReinitialisation(label: string) {
  const mail = testEmail(label);
  await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });
  await auth.api.requestPasswordReset({
    body: { email: mail, redirectTo: '/reinitialiser-mot-de-passe' },
    headers: new Headers(),
    asResponse: true,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  const verification = await prisma.verification.findFirstOrThrow({
    where: { value: user.id, identifier: { startsWith: 'reset-password:' } },
    orderBy: { createdAt: 'desc' },
  });
  return { mail, verification, token: verification.identifier.replace('reset-password:', '') };
}

/** Demande un lien magique et renvoie la ligne Verification correspondante. */
async function demanderLienMagique(mail: string) {
  await auth.api.signInMagicLink({ body: { email: mail, callbackURL: '/bienvenue' }, headers: new Headers(), asResponse: true });
  return await prisma.verification.findFirstOrThrow({
    where: { value: { contains: mail } },
    orderBy: { createdAt: 'desc' },
  });
}

/** Demande un code par email et renvoie le code en clair lu en base. */
async function demanderCode(mail: string) {
  await auth.api.sendVerificationOTP({ body: { email: mail, type: 'sign-in' }, headers: new Headers(), asResponse: true });
  const verification = await prisma.verification.findFirstOrThrow({
    where: { identifier: `sign-in-otp-${mail}` },
    orderBy: { createdAt: 'desc' },
  });
  return { verification, code: verification.value.split(':')[0] };
}

describe("jeton de verification d'email", () => {
  it('refuse un jeton malforme', async () => {
    const res = await auth.api.verifyEmail({ query: { token: 'nimporte.quoi.ici' }, headers: new Headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  it('refuse un jeton expire', async () => {
    const mail = testEmail('jwt-expire');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });

    const token = await signerJeton({ email: mail }, { expiresIn: -60 });
    const res = await auth.api.verifyEmail({ query: { token }, headers: new Headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('TOKEN_EXPIRED');
    expect((await prisma.user.findUniqueOrThrow({ where: { email: mail } })).emailVerified).toBe(false);
  });

  it("refuse un jeton signe avec une autre cle (jeton forge)", async () => {
    const mail = testEmail('jwt-forge');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });

    const token = await signerJeton({ email: mail }, { secret: 'une-cle-qui-n-est-pas-celle-du-serveur' });
    const res = await auth.api.verifyEmail({ query: { token }, headers: new Headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('INVALID_TOKEN');
    expect((await prisma.user.findUniqueOrThrow({ where: { email: mail } })).emailVerified).toBe(false);
  });

  it("refuse un jeton valide mais emis pour une adresse qui n'existe pas", async () => {
    const token = await signerJeton({ email: testEmail('jwt-fantome') });
    const res = await auth.api.verifyEmail({ query: { token }, headers: new Headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('USER_NOT_FOUND');
  });
});

describe('jeton de reinitialisation de mot de passe', () => {
  it('ne peut servir qu une seule fois', async () => {
    const { mail, token } = await demanderReinitialisation('reset-usage');

    const premier = await auth.api.resetPassword({ body: { newPassword: 'PremierPass123!', token }, headers: new Headers(), asResponse: true });
    expect(premier.status).toBe(200);

    const second = await auth.api.resetPassword({ body: { newPassword: 'SecondPass123!', token }, headers: new Headers(), asResponse: true });
    const body = await second.json();
    expect(second.status).toBe(400);
    expect(body.code).toBe('INVALID_TOKEN');

    // Le second mot de passe n'a jamais ete applique.
    const connexion = await auth.api.signInEmail({ body: { email: mail, password: 'SecondPass123!' }, headers: new Headers(), asResponse: true });
    expect(connexion.status).toBe(401);
  });

  it('est refuse une fois expire', async () => {
    const { mail, verification, token } = await demanderReinitialisation('reset-expire');
    // On antidate la ligne plutot que d'attendre l'heure d'expiration reelle.
    await prisma.verification.update({ where: { id: verification.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    const res = await auth.api.resetPassword({ body: { newPassword: 'TropTard123!', token }, headers: new Headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_TOKEN');
    // L'ancien mot de passe reste le bon.
    const connexion = await auth.api.signInEmail({ body: { email: mail, password: PASSWORD }, headers: new Headers(), asResponse: true });
    expect(connexion.status).toBe(200);
  });

  it('refuse un jeton inexistant', async () => {
    const res = await auth.api.resetPassword({
      body: { newPassword: 'PeuImporte123!', token: 'jeton-invente-de-toutes-pieces' },
      headers: new Headers(),
      asResponse: true,
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_TOKEN');
  });

  it('applique la longueur minimale au nouveau mot de passe', async () => {
    const { token } = await demanderReinitialisation('reset-court');

    const res = await auth.api.resetPassword({ body: { newPassword: 'court', token }, headers: new Headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('PASSWORD_TOO_SHORT');
  });
});

describe('jeton de lien magique', () => {
  it('ne peut servir qu une seule fois', async () => {
    const mail = testEmail('magic-usage');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });
    const verification = await demanderLienMagique(mail);

    const premier = await auth.api.magicLinkVerify({ query: { token: verification.identifier }, headers: new Headers(), asResponse: true });
    expect(premier.status).toBe(200);

    // Sans callbackURL explicite, better-auth redirige vers "/" en signalant
    // l'erreur dans la query string plutot que de renvoyer un statut 4xx.
    const second = await auth.api.magicLinkVerify({ query: { token: verification.identifier }, headers: new Headers(), asResponse: true });
    expect(second.status).toBe(302);
    expect(second.headers.get('location')).toContain('error=INVALID_TOKEN');
  });

  it('est refuse une fois expire', async () => {
    const mail = testEmail('magic-expire');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });
    const verification = await demanderLienMagique(mail);
    await prisma.verification.update({ where: { id: verification.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    const res = await auth.api.magicLinkVerify({ query: { token: verification.identifier }, headers: new Headers(), asResponse: true });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=INVALID_TOKEN');
  });

  it('refuse un jeton inconnu', async () => {
    const res = await auth.api.magicLinkVerify({ query: { token: 'jeton-invente' }, headers: new Headers(), asResponse: true });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=INVALID_TOKEN');
  });
});

describe('code de connexion par email (OTP)', () => {
  it('ne peut servir qu une seule fois', async () => {
    const mail = testEmail('otp-usage');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });
    const { code } = await demanderCode(mail);

    const premier = await auth.api.signInEmailOTP({ body: { email: mail, otp: code }, headers: new Headers(), asResponse: true });
    expect(premier.status).toBe(200);

    const second = await auth.api.signInEmailOTP({ body: { email: mail, otp: code }, headers: new Headers(), asResponse: true });
    const body = await second.json();
    expect(second.status).toBe(400);
    expect(body.code).toBe('INVALID_OTP');
  });

  it('est refuse une fois expire', async () => {
    const mail = testEmail('otp-expire');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });
    const { verification, code } = await demanderCode(mail);
    await prisma.verification.update({ where: { id: verification.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    const res = await auth.api.signInEmailOTP({ body: { email: mail, otp: code }, headers: new Headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('OTP_EXPIRED');
  });

  it('se bloque apres trois essais errones, meme si le bon code est ensuite fourni', async () => {
    const mail = testEmail('otp-brute');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });
    const { code } = await demanderCode(mail);

    for (const faux of ['000000', '000001', '000002']) {
      const essai = await auth.api.signInEmailOTP({ body: { email: mail, otp: faux }, headers: new Headers(), asResponse: true });
      expect(essai.status).toBe(400);
      expect((await essai.json()).code).toBe('INVALID_OTP');
    }

    // Le budget de tentatives (3 par defaut) est epuise : le code correct est
    // desormais inutilisable, ce qui bloque une attaque par force brute.
    const res = await auth.api.signInEmailOTP({ body: { email: mail, otp: code }, headers: new Headers(), asResponse: true });
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('refuse de generer un code pour une adresse malformee', async () => {
    const res = await auth.api.sendVerificationOTP({ body: { email: 'pas-un-email', type: 'sign-in' }, headers: new Headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_EMAIL');
  });
});
