// @vitest-environment node
import crypto from 'node:crypto';
import { describe, it, expect, vi, afterAll } from 'vitest';
import { cookieJar, testEmail, totpCode, makeEmailVerificationJWT, TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

// L'appli envoie les emails transactionnels via Resend (voir src/lib/email.ts).
// On mocke tout le module : les tests verifient que le bon email est
// declenche (via ces mocks), sans dependre du reseau, d'une cle API Resend
// valide, ni consommer le quota d'envoi reel.
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
const email = await import('@/lib/email');

const PASSWORD = 'InitialPass123!';

// Ces tests s'executent contre la vraie base Neon de dev (pas de mock DB) via
// auth.api.*, exactement comme le ferait une requete HTTP mais sans passer
// par un serveur Next demarre. Tous les comptes crees sont prefixes et
// supprimes en fin de suite.
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
});

describe('inscription et connexion', () => {
  it("ignore un role fourni par le client (privilege escalation)", async () => {
    const mail = testEmail('role-escalation');
    // `role` a `input: false` dans auth.ts : un vrai client ne peut meme pas
    // le construire (absent du type infere). On force le champ via `as any`
    // pour simuler une requete brute forgee a la main et verifier que le
    // serveur l'ignore bien, pas seulement que le client ne l'expose pas.
    const res = await auth.api.signUpEmail({
      body: { name: 'Role Test', email: mail, password: PASSWORD, role: 'admin' },
      asResponse: true,
    } as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.role).toBe('CABINET_RH');
  });

  it("l'email n'est pas verifie a l'inscription (verification souple)", async () => {
    const mail = testEmail('fresh-signup');
    const res = await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true });
    const body = await res.json();

    expect(body.user.emailVerified).toBe(false);
  });

  it('connecte avec le bon mot de passe', async () => {
    const mail = testEmail('login-ok');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });

    const res = await auth.api.signInEmail({ body: { email: mail, password: PASSWORD }, headers: new Headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.email).toBe(mail);
  });

  it('rejette un mauvais mot de passe', async () => {
    const mail = testEmail('login-bad');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });

    const res = await auth.api.signInEmail({ body: { email: mail, password: 'WrongPassword!' }, headers: new Headers(), asResponse: true });

    expect(res.status).toBe(401);
  });
});

describe('verification email', () => {
  it("verifie l'email via le lien recu et connecte automatiquement", async () => {
    const mail = testEmail('verify');
    const cj = cookieJar();
    const signUp = await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true });
    cj.apply(signUp);

    const token = await makeEmailVerificationJWT(mail);
    const res = await auth.api.verifyEmail({ query: { token }, headers: cj.headers(), asResponse: true });
    cj.apply(res);
    expect(res.status).toBe(200);

    const session = await auth.api.getSession({ headers: cj.headers() });
    expect(session?.user.emailVerified).toBe(true);
  });

  it("l'inscription declenche l'envoi de l'email de verification", async () => {
    const mail = testEmail('verify-sent');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });

    expect(email.sendVerificationEmail).toHaveBeenCalledWith(mail, expect.stringContaining('token='));
  });
});

describe('mot de passe oublie', () => {
  it("reinitialise le mot de passe via le token recu, l'ancien mot de passe est ensuite rejete", async () => {
    const mail = testEmail('reset');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });

    const reqRes = await auth.api.requestPasswordReset({
      body: { email: mail, redirectTo: '/reinitialiser-mot-de-passe' },
      headers: new Headers(),
      asResponse: true,
    });
    expect(reqRes.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    const verification = await prisma.verification.findFirst({
      where: { value: user.id, identifier: { startsWith: 'reset-password:' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(verification).not.toBeNull();
    const token = verification!.identifier.replace('reset-password:', '');

    const newPassword = 'BrandNewPass456!';
    const resetRes = await auth.api.resetPassword({ body: { newPassword, token }, headers: new Headers(), asResponse: true });
    expect(resetRes.status).toBe(200);

    const oldLogin = await auth.api.signInEmail({ body: { email: mail, password: PASSWORD }, headers: new Headers(), asResponse: true });
    expect(oldLogin.status).toBe(401);

    const newLogin = await auth.api.signInEmail({ body: { email: mail, password: newPassword }, headers: new Headers(), asResponse: true });
    expect(newLogin.status).toBe(200);
  });
});

describe('gestion du profil', () => {
  it('modifie le nom', async () => {
    const mail = testEmail('rename');
    const cj = cookieJar();
    const signUp = await auth.api.signUpEmail({ body: { name: 'Old Name', email: mail, password: PASSWORD }, asResponse: true });
    cj.apply(signUp);

    const res = await auth.api.updateUser({ body: { name: 'New Name' }, headers: cj.headers(), asResponse: true });
    cj.apply(res);
    expect(res.status).toBe(200);

    const session = await auth.api.getSession({ headers: cj.headers() });
    expect(session?.user.name).toBe('New Name');
  });

  it('modifie le mot de passe et notifie par email', async () => {
    const mail = testEmail('change-pass');
    const cj = cookieJar();
    const signUp = await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true });
    cj.apply(signUp);

    const newPassword = 'ChangedPass789!';
    const res = await auth.api.changePassword({
      body: { currentPassword: PASSWORD, newPassword, revokeOtherSessions: true },
      headers: cj.headers(),
      asResponse: true,
    });
    expect(res.status).toBe(200);
    expect(email.sendPasswordChangedEmail).toHaveBeenCalledWith(mail);

    const login = await auth.api.signInEmail({ body: { email: mail, password: newPassword }, headers: new Headers(), asResponse: true });
    expect(login.status).toBe(200);
  });

  it("change l'email en deux etapes (confirmation ancienne adresse puis nouvelle)", async () => {
    const mail = testEmail('change-email-old');
    const newMail = testEmail('change-email-new');
    const cj = cookieJar();
    const signUp = await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true });
    cj.apply(signUp);

    // L'appli exige un email verifie pour envoyer la confirmation (voir
    // auth.ts: canSendConfirmation) - on verifie d'abord.
    const verifyToken = await makeEmailVerificationJWT(mail);
    const verifyRes = await auth.api.verifyEmail({ query: { token: verifyToken }, headers: cj.headers(), asResponse: true });
    cj.apply(verifyRes);

    const changeRes = await auth.api.changeEmail({ body: { newEmail: newMail, callbackURL: '/dashboard' }, headers: cj.headers(), asResponse: true });
    expect(changeRes.status).toBe(200);
    expect(email.sendChangeEmailConfirmationEmail).toHaveBeenCalledWith(mail, newMail, expect.stringContaining('token='));

    // Etape 2 : le lien envoye a la NOUVELLE adresse finalise le changement.
    const finalizeToken = await makeEmailVerificationJWT(mail, newMail, 'change-email-verification');
    const finalizeRes = await auth.api.verifyEmail({ query: { token: finalizeToken }, headers: cj.headers(), asResponse: true });
    cj.apply(finalizeRes);
    expect(finalizeRes.status).toBe(200);

    const session = await auth.api.getSession({ headers: cj.headers() });
    expect(session?.user.email).toBe(newMail);
  });
});

describe('double authentification (2FA)', () => {
  it('active, confirme, exige un code a la reconnexion, puis se desactive', async () => {
    const mail = testEmail('2fa');
    const cj = cookieJar();
    const signUp = await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true });
    cj.apply(signUp);

    const enableRes = await auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true });
    expect(enableRes.status).toBe(200);
    const enableBody = await enableRes.json();
    expect(enableBody.totpURI).toBeDefined();
    expect(enableBody.backupCodes.length).toBeGreaterThan(0);

    const secret = new URL(enableBody.totpURI).searchParams.get('secret')!;

    const verifyRes = await auth.api.verifyTOTP({ body: { code: totpCode(secret) }, headers: cj.headers(), asResponse: true });
    cj.apply(verifyRes);
    expect(verifyRes.status).toBe(200);
    expect(email.sendTwoFactorEnabledEmail).toHaveBeenCalledWith(mail);

    const sessionAfterEnable = await auth.api.getSession({ headers: cj.headers() });
    expect(sessionAfterEnable?.user.twoFactorEnabled).toBe(true);

    // Reconnexion : doit exiger le defi 2FA, pas juste email+mot de passe.
    const cj2 = cookieJar();
    const loginRes = await auth.api.signInEmail({ body: { email: mail, password: PASSWORD }, headers: new Headers(), asResponse: true });
    cj2.apply(loginRes);
    const loginBody = await loginRes.json();
    expect(loginBody.twoFactorRedirect).toBe(true);

    const sessionMidChallenge = await auth.api.getSession({ headers: cj2.headers() });
    expect(sessionMidChallenge).toBeFalsy();

    const challengeRes = await auth.api.verifyTOTP({ body: { code: totpCode(secret) }, headers: cj2.headers(), asResponse: true });
    cj2.apply(challengeRes);
    expect(challengeRes.status).toBe(200);

    const sessionAfterChallenge = await auth.api.getSession({ headers: cj2.headers() });
    expect(sessionAfterChallenge?.user.email).toBe(mail);

    const disableRes = await auth.api.disableTwoFactor({ body: { password: PASSWORD }, headers: cj2.headers(), asResponse: true });
    cj2.apply(disableRes);
    expect(disableRes.status).toBe(200);
    expect(email.sendTwoFactorDisabledEmail).toHaveBeenCalledWith(mail);

    const sessionAfterDisable = await auth.api.getSession({ headers: cj2.headers() });
    expect(sessionAfterDisable?.user.twoFactorEnabled).toBe(false);
  });
});

describe('connexion sans mot de passe', () => {
  it('lien magique : connecte un compte existant', async () => {
    const mail = testEmail('magic');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });

    const reqRes = await auth.api.signInMagicLink({
      body: { email: mail, callbackURL: '/bienvenue' },
      headers: new Headers(),
      asResponse: true,
    });
    expect(reqRes.status).toBe(200);
    expect(email.sendMagicLinkEmail).toHaveBeenCalledWith(mail, expect.any(String));

    const verification = await prisma.verification.findFirst({
      where: { value: { contains: mail } },
      orderBy: { createdAt: 'desc' },
    });
    expect(verification).not.toBeNull();

    const cj = cookieJar();
    const verifyRes = await auth.api.magicLinkVerify({
      query: { token: verification!.identifier },
      headers: new Headers(),
      asResponse: true,
    });
    cj.apply(verifyRes);
    expect(verifyRes.status).toBe(200);

    const session = await auth.api.getSession({ headers: cj.headers() });
    expect(session?.user.email).toBe(mail);
  });

  it("lien magique : ne cree PAS de compte pour un email inconnu (disableSignUp)", async () => {
    const unknownMail = testEmail('magic-unknown');

    await auth.api.signInMagicLink({ body: { email: unknownMail, callbackURL: '/bienvenue' }, headers: new Headers(), asResponse: true });

    const verification = await prisma.verification.findFirst({
      where: { value: { contains: unknownMail } },
      orderBy: { createdAt: 'desc' },
    });

    if (verification) {
      await auth.api.magicLinkVerify({ query: { token: verification.identifier }, headers: new Headers(), asResponse: true });
    }

    const created = await prisma.user.findUnique({ where: { email: unknownMail } });
    expect(created).toBeNull();
  });

  it('code par email : connecte un compte existant', async () => {
    const mail = testEmail('otp');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });

    const sendRes = await auth.api.sendVerificationOTP({
      body: { email: mail, type: 'sign-in' },
      headers: new Headers(),
      asResponse: true,
    });
    expect(sendRes.status).toBe(200);

    const verification = await prisma.verification.findFirst({
      where: { identifier: `sign-in-otp-${mail}` },
      orderBy: { createdAt: 'desc' },
    });
    expect(verification).not.toBeNull();
    const otp = verification!.value.split(':')[0];

    const res = await auth.api.signInEmailOTP({ body: { email: mail, otp }, headers: new Headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.email).toBe(mail);
  });
});

describe('comptes lies et suppression', () => {
  it("delier un compte OAuth declenche l'email de notification", async () => {
    const mail = testEmail('unlink');
    const cj = cookieJar();
    const signUp = await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true });
    cj.apply(signUp);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    const accountId = crypto.randomUUID();
    await prisma.account.create({
      data: {
        id: accountId,
        providerId: 'google',
        issuer: 'local:oauth:google',
        accountId: `fake-google-${user.id}`,
        userId: user.id,
      },
    });

    const res = await auth.api.unlinkAccount({ body: { accountId }, headers: cj.headers(), asResponse: true });
    expect(res.status).toBe(200);
    expect(email.sendAccountUnlinkedEmail).toHaveBeenCalledWith(mail, 'Google');
  });

  it('envoie un email de confirmation puis archive le compte apres clic sur le lien', async () => {
    const mail = testEmail('delete');
    const cj = cookieJar();
    const signUp = await auth.api.signUpEmail({ body: { name: 'A Supprimer', email: mail, password: PASSWORD }, asResponse: true });
    cj.apply(signUp);

    // Etape 1 : /delete-user n'efface plus rien directement, il envoie un
    // email de confirmation (voir doc/analysis/AUDIT_SECURITE_AUTH.md,
    // finding #4).
    const res = await auth.api.deleteUser({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true });
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('Verification email sent');
    expect(email.sendDeleteAccountVerificationEmail).toHaveBeenCalledWith(mail, 'A Supprimer', expect.any(String));
    expect(email.sendAccountDeletedEmail).not.toHaveBeenCalled();
    expect(await prisma.user.findUnique({ where: { email: mail } })).not.toBeNull();

    // Etape 2 : clic sur le lien recu par email (meme session). Le compte
    // n'est pas vraiment efface : il est archive (deletedAt), recuperable
    // 30 jours avant purge reelle (voir scripts/restore-account.ts).
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    const verification = await prisma.verification.findFirstOrThrow({
      where: { value: user.id, identifier: { startsWith: 'delete-account-' } },
      orderBy: { createdAt: 'desc' },
    });
    const token = verification.identifier.replace('delete-account-', '');
    const callback = await auth.api.deleteUserCallback({ query: { token }, headers: cj.headers(), asResponse: true });
    expect(callback.status).toBe(200);
    expect(email.sendAccountDeletedEmail).toHaveBeenCalledWith(mail, 'A Supprimer');

    const archived = await prisma.user.findUnique({ where: { email: mail } });
    expect(archived).not.toBeNull();
    expect(archived?.deletedAt).not.toBeNull();

    // La session utilisee pour la suppression est bien revoquee.
    expect(await auth.api.getSession({ headers: cj.headers() })).toBeFalsy();

    // Et le compte archive ne peut plus se reconnecter (voir hooks.after).
    const relogin = await auth.api.signInEmail({
      body: { email: mail, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    expect(relogin.status).toBe(401);
    expect((await relogin.json()).code).toBe('INVALID_EMAIL_OR_PASSWORD');
  });
});
