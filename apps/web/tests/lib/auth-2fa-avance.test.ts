// @vitest-environment node
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

const PASSWORD = 'InitialPass123!';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: {
      OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }],
    },
  });
});

/** Cree un compte, active la 2FA et la confirme par un premier code TOTP. */
async function creerCompteAvec2FA(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

  const enableRes = await auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true });
  const { totpURI, backupCodes } = await enableRes.json();
  const secret = new URL(totpURI).searchParams.get('secret') as string;
  cj.apply(await auth.api.verifyTOTP({ body: { code: totpCode(secret) }, headers: cj.headers(), asResponse: true }));

  return { mail, cj, secret, backupCodes: backupCodes as string[] };
}

/** Se connecte par mot de passe et s'arrete au defi 2FA (session incomplete). */
async function ouvrirDefi2FA(mail: string) {
  const cj = cookieJar();
  const res = await auth.api.signInEmail({ body: { email: mail, password: PASSWORD }, headers: new Headers(), asResponse: true });
  cj.apply(res);
  const body = await res.json();
  expect(body.twoFactorRedirect).toBe(true);
  return cj;
}

describe('2FA : activation et prerequis', () => {
  it('refuse l activation si le mot de passe est faux', async () => {
    const mail = testEmail('2fa-mdp');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    const res = await auth.api.enableTwoFactor({ body: { password: 'MauvaisPass123!' }, headers: cj.headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_PASSWORD');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    expect(await prisma.twoFactor.count({ where: { userId: user.id } })).toBe(0);
  });

  it("n'active reellement la 2FA qu'apres confirmation par un code TOTP", async () => {
    const mail = testEmail('2fa-non-confirmee');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    const enable = await auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true });
    expect(enable.status).toBe(200);

    // Le secret est stocke mais non verifie : une reconnexion ne doit pas
    // exiger de code, sinon un utilisateur qui abandonne en cours de
    // configuration se retrouverait enferme dehors.
    const res = await auth.api.signInEmail({ body: { email: mail, password: PASSWORD }, headers: new Headers(), asResponse: true });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.twoFactorRedirect).toBeUndefined();
    expect(body.user.twoFactorEnabled).toBe(false);
  });

  it('refuse la desactivation si le mot de passe est faux', async () => {
    const { mail, cj } = await creerCompteAvec2FA('2fa-desactiver-mdp');

    const res = await auth.api.disableTwoFactor({ body: { password: 'MauvaisPass123!' }, headers: cj.headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_PASSWORD');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    expect(user.twoFactorEnabled).toBe(true);
    expect(await prisma.twoFactor.count({ where: { userId: user.id } })).toBe(1);
  });
});

describe('2FA : actions impossibles sans 2FA active', () => {
  it('refuse la verification TOTP', async () => {
    const mail = testEmail('2fa-absente-totp');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    const res = await auth.api.verifyTOTP({ body: { code: '123456' }, headers: cj.headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('TOTP_NOT_ENABLED');
  });

  it('refuse la generation de codes de secours', async () => {
    const mail = testEmail('2fa-absente-codes');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    const res = await auth.api.generateBackupCodes({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('TWO_FACTOR_NOT_ENABLED');
  });

  it("refuse un code de secours envoye hors de tout defi de connexion", async () => {
    const res = await auth.api.verifyBackupCode({ body: { code: 'aaaaa-bbbbb' }, headers: new Headers(), asResponse: true });
    const body = await res.json();

    // Sans cookie de defi 2FA, l'appel n'est rattache a aucun utilisateur.
    expect(res.status).toBe(401);
    expect(body.code).toBe('INVALID_TWO_FACTOR_COOKIE');
  });
});

describe('2FA : codes de secours', () => {
  it('permet de se connecter quand l application d authentification est indisponible', async () => {
    const { mail, backupCodes } = await creerCompteAvec2FA('2fa-secours');
    expect(backupCodes).toHaveLength(10);

    const cj = await ouvrirDefi2FA(mail);
    const res = await auth.api.verifyBackupCode({ body: { code: backupCodes[0] }, headers: cj.headers(), asResponse: true });
    cj.apply(res);
    expect(res.status).toBe(200);

    const session = await auth.api.getSession({ headers: cj.headers() });
    expect(session?.user.email).toBe(mail);
  });

  it('invalide un code de secours des sa premiere utilisation', async () => {
    const { mail, backupCodes } = await creerCompteAvec2FA('2fa-secours-unique');

    const premier = await ouvrirDefi2FA(mail);
    expect((await auth.api.verifyBackupCode({ body: { code: backupCodes[0] }, headers: premier.headers(), asResponse: true })).status).toBe(200);

    const second = await ouvrirDefi2FA(mail);
    const rejeu = await auth.api.verifyBackupCode({ body: { code: backupCodes[0] }, headers: second.headers(), asResponse: true });
    expect(rejeu.status).toBe(401);
    expect((await rejeu.json()).code).toBe('INVALID_BACKUP_CODE');

    // Les autres codes de la meme serie restent utilisables.
    const troisieme = await ouvrirDefi2FA(mail);
    const autre = await auth.api.verifyBackupCode({ body: { code: backupCodes[1] }, headers: troisieme.headers(), asResponse: true });
    troisieme.apply(autre);
    expect(autre.status).toBe(200);
    expect((await auth.api.getSession({ headers: troisieme.headers() }))?.user.email).toBe(mail);
  });

  it('la regeneration remplace entierement l ancienne serie', async () => {
    const { mail, cj, backupCodes } = await creerCompteAvec2FA('2fa-regen');

    const regen = await auth.api.generateBackupCodes({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true });
    const nouveaux: string[] = (await regen.json()).backupCodes;
    expect(regen.status).toBe(200);
    expect(nouveaux).toHaveLength(10);
    expect(nouveaux).not.toContain(backupCodes[0]);

    const ancien = await ouvrirDefi2FA(mail);
    const refus = await auth.api.verifyBackupCode({ body: { code: backupCodes[0] }, headers: ancien.headers(), asResponse: true });
    expect(refus.status).toBe(401);

    const nouveau = await ouvrirDefi2FA(mail);
    const accepte = await auth.api.verifyBackupCode({ body: { code: nouveaux[0] }, headers: nouveau.headers(), asResponse: true });
    nouveau.apply(accepte);
    expect(accepte.status).toBe(200);
    expect((await auth.api.getSession({ headers: nouveau.headers() }))?.user.email).toBe(mail);
  });
});

describe('2FA : codes TOTP invalides', () => {
  it('rejette un mauvais code puis accepte le bon dans le meme defi', async () => {
    const { mail, secret } = await creerCompteAvec2FA('2fa-mauvais-code');
    const cj = await ouvrirDefi2FA(mail);

    const mauvais = await auth.api.verifyTOTP({ body: { code: '000000' }, headers: cj.headers(), asResponse: true });
    expect(mauvais.status).toBe(401);
    expect((await mauvais.json()).code).toBe('INVALID_CODE');
    // Le defi n'est pas encore consomme : aucune session n'a ete creee.
    expect(await auth.api.getSession({ headers: cj.headers() })).toBeFalsy();

    const bon = await auth.api.verifyTOTP({ body: { code: totpCode(secret) }, headers: cj.headers(), asResponse: true });
    cj.apply(bon);
    expect(bon.status).toBe(200);
    expect((await auth.api.getSession({ headers: cj.headers() }))?.user.email).toBe(mail);
  });

  it("rejette un code TOTP d'une fenetre de temps trop ancienne", async () => {
    const { mail, secret } = await creerCompteAvec2FA('2fa-code-perime');
    const cj = await ouvrirDefi2FA(mail);

    // Code genere pour une fenetre de 10 minutes dans le passe : bien forme
    // mais hors de la tolerance acceptee par le serveur.
    const codePerime = totpCode(secret, Date.now() - 10 * 60 * 1000);
    const res = await auth.api.verifyTOTP({ body: { code: codePerime }, headers: cj.headers(), asResponse: true });

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('INVALID_CODE');
  });
});
