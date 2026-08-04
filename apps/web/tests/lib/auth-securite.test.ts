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
  sendDeleteAccountVerificationEmail: vi.fn().mockResolvedValue(undefined),
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

async function creerCompte(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { mail, cj, user };
}

describe('elevation de privileges', () => {
  it("refuse de modifier le role apres l'inscription", async () => {
    const { mail, cj } = await creerCompte('role-update');

    // Complement du test d'inscription existant : `input: false` doit aussi
    // tenir sur /update-user, sinon il suffirait de s'inscrire puis de se
    // promouvoir.
    const res = await auth.api.updateUser({ body: { role: 'admin' }, headers: cj.headers(), asResponse: true } as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('FIELD_NOT_ALLOWED');
    expect((await prisma.user.findUniqueOrThrow({ where: { email: mail } })).role).toBe('cabinet');
  });

  it('refuse un role glisse au milieu de champs legitimes', async () => {
    const { mail, cj } = await creerCompte('role-melange');

    const res = await auth.api.updateUser({
      body: { name: 'Nouveau Nom', role: 'admin' },
      headers: cj.headers(),
      asResponse: true,
    } as never);

    // Le rejet est global : le champ legitime n'est pas applique non plus.
    expect(res.status).toBe(400);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    expect(user.role).toBe('cabinet');
    expect(user.name).toBe('X');
  });

  it("ignore un role fourni lors d'une connexion par code email", async () => {
    const { mail } = await creerCompte('role-otp');
    await auth.api.sendVerificationOTP({ body: { email: mail, type: 'sign-in' }, headers: new Headers(), asResponse: true });
    const verification = await prisma.verification.findFirstOrThrow({
      where: { identifier: `sign-in-otp-${mail}` },
      orderBy: { createdAt: 'desc' },
    });

    const res = await auth.api.signInEmailOTP({
      body: { email: mail, otp: verification.value.split(':')[0], role: 'admin' },
      headers: new Headers(),
      asResponse: true,
    } as never);

    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: mail } })).role).toBe('cabinet');
  });
});

describe('cloisonnement entre comptes', () => {
  it("la session de A ne permet pas de revoquer la session de B", async () => {
    const { cj: cjA } = await creerCompte('idor-a');
    const { cj: cjB, user: userB } = await creerCompte('idor-b');
    const sessionB = (await auth.api.getSession({ headers: cjB.headers() }))!.session.token;

    const res = await auth.api.revokeSession({ body: { token: sessionB }, headers: cjA.headers(), asResponse: true });

    // L'endpoint repond 200 sans confirmer si le jeton existait (pas de
    // divulgation), mais il ne touche que les sessions de l'appelant.
    expect(res.status).toBe(200);
    expect(await auth.api.getSession({ headers: cjB.headers() })).toBeTruthy();
    expect(await prisma.session.count({ where: { userId: userB.id } })).toBe(1);
  });

  it("la session de A ne permet pas de delier le compte OAuth de B", async () => {
    const { cj: cjA, user: userA } = await creerCompte('idor-unlink-a');
    const { user: userB } = await creerCompte('idor-unlink-b');
    await prisma.account.create({
      data: { id: crypto.randomUUID(), providerId: 'google', accountId: `google-${userA.id}`, userId: userA.id },
    });
    await prisma.account.create({
      data: { id: crypto.randomUUID(), providerId: 'google', accountId: `google-${userB.id}`, userId: userB.id },
    });

    // `accountId` est le seul identifiant accepte dans le corps : on verifie
    // qu'il est bien resolu parmi les comptes de l'appelant uniquement.
    const res = await auth.api.unlinkAccount({
      body: { providerId: 'google', accountId: `google-${userB.id}` },
      headers: cjA.headers(),
      asResponse: true,
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('ACCOUNT_NOT_FOUND');
    expect(await prisma.account.count({ where: { userId: userB.id, providerId: 'google' } })).toBe(1);
    expect(await prisma.account.count({ where: { userId: userA.id, providerId: 'google' } })).toBe(1);
  });

  it("le mot de passe de A ne permet pas d'agir sur le compte de B", async () => {
    const { mail: mailA } = await creerCompte('cred-a');
    const { cj: cjB, mail: mailB } = await creerCompte('cred-b');

    // changePassword agit toujours sur l'utilisateur de la session : meme en
    // connaissant le mot de passe d'un autre compte, on ne modifie que le sien.
    const res = await auth.api.changePassword({
      body: { currentPassword: PASSWORD, newPassword: 'ChangeParB123!' },
      headers: cjB.headers(),
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const connexionA = await auth.api.signInEmail({ body: { email: mailA, password: PASSWORD }, headers: new Headers(), asResponse: true });
    expect(connexionA.status).toBe(200);
    const connexionB = await auth.api.signInEmail({ body: { email: mailB, password: PASSWORD }, headers: new Headers(), asResponse: true });
    expect(connexionB.status).toBe(401);
  });
});

describe('connexion sans mot de passe : pas de contournement', () => {
  it("un lien magique sur un compte non verifie revoque le mot de passe et les sessions preexistants", async () => {
    // Scenario : quelqu'un s'inscrit avec l'adresse d'un tiers (jamais
    // verifiee) et choisit un mot de passe. Quand le vrai proprietaire prouve
    // qu'il controle la boite mail, better-auth supprime le compte
    // `credential` accumule avant cette preuve.
    const { mail, cj: cjSquatteur, user } = await creerCompte('magic-non-verifie');
    expect(await prisma.account.count({ where: { userId: user.id, providerId: 'credential' } })).toBe(1);

    await auth.api.signInMagicLink({ body: { email: mail, callbackURL: '/bienvenue' }, headers: new Headers(), asResponse: true });
    const verification = await prisma.verification.findFirstOrThrow({
      where: { value: { contains: mail } },
      orderBy: { createdAt: 'desc' },
    });
    const cjProprietaire = cookieJar();
    const res = await auth.api.magicLinkVerify({ query: { token: verification.identifier }, headers: new Headers(), asResponse: true });
    cjProprietaire.apply(res);
    expect(res.status).toBe(200);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(true);
    expect(await prisma.account.count({ where: { userId: user.id, providerId: 'credential' } })).toBe(0);
    // L'ancien mot de passe ne fonctionne plus et l'ancienne session est morte.
    const connexion = await auth.api.signInEmail({ body: { email: mail, password: PASSWORD }, headers: new Headers(), asResponse: true });
    expect(connexion.status).toBe(401);
    expect(await auth.api.getSession({ headers: cjSquatteur.headers() })).toBeFalsy();
    expect((await auth.api.getSession({ headers: cjProprietaire.headers() }))?.user.email).toBe(mail);
  });

  it('un code par email sur un compte non verifie applique la meme revocation', async () => {
    const { mail, user } = await creerCompte('otp-non-verifie');

    await auth.api.sendVerificationOTP({ body: { email: mail, type: 'sign-in' }, headers: new Headers(), asResponse: true });
    const verification = await prisma.verification.findFirstOrThrow({
      where: { identifier: `sign-in-otp-${mail}` },
      orderBy: { createdAt: 'desc' },
    });
    const res = await auth.api.signInEmailOTP({
      body: { email: mail, otp: verification.value.split(':')[0] },
      headers: new Headers(),
      asResponse: true,
    });
    expect(res.status).toBe(200);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(true);
    expect(await prisma.account.count({ where: { userId: user.id, providerId: 'credential' } })).toBe(0);
  });

  it("un code par email ne cree pas de compte pour une adresse inconnue (disableSignUp)", async () => {
    const inconnu = testEmail('otp-inconnu');

    const envoi = await auth.api.sendVerificationOTP({ body: { email: inconnu, type: 'sign-in' }, headers: new Headers(), asResponse: true });
    expect(envoi.status).toBe(200);
    // Aucun code n'est meme stocke : la reponse neutre ne revele rien.
    expect(await prisma.verification.count({ where: { identifier: `sign-in-otp-${inconnu}` } })).toBe(0);
    expect(email.sendOTPEmail).not.toHaveBeenCalledWith(inconnu, expect.any(String));

    const connexion = await auth.api.signInEmailOTP({ body: { email: inconnu, otp: '123456' }, headers: new Headers(), asResponse: true });
    expect(connexion.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { email: inconnu } })).toBeNull();
  });
});

describe('notifications de securite : declenchement maitrise', () => {
  it("n'envoie pas l'email d'activation 2FA lors du defi de connexion", async () => {
    const mail = testEmail('hook-2fa');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));
    const enable = await auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers: cj.headers(), asResponse: true });
    const secret = new URL((await enable.json()).totpURI).searchParams.get('secret') as string;
    cj.apply(await auth.api.verifyTOTP({ body: { code: totpCode(secret) }, headers: cj.headers(), asResponse: true }));
    expect(email.sendTwoFactorEnabledEmail).toHaveBeenCalledWith(mail);

    vi.mocked(email.sendTwoFactorEnabledEmail).mockClear();

    // Meme endpoint (/two-factor/verify-totp), mais cette fois pendant un defi
    // de connexion : le hook `after` d'auth.ts ne doit pas confondre les deux,
    // sinon l'utilisateur recevrait "2FA activee" a chaque connexion.
    const cjDefi = cookieJar();
    cjDefi.apply(await auth.api.signInEmail({ body: { email: mail, password: PASSWORD }, headers: new Headers(), asResponse: true }));
    const defi = await auth.api.verifyTOTP({ body: { code: totpCode(secret) }, headers: cjDefi.headers(), asResponse: true });
    cjDefi.apply(defi);

    expect(defi.status).toBe(200);
    expect(email.sendTwoFactorEnabledEmail).not.toHaveBeenCalled();
  });

  // Regression : le hook `after` deduisait le succes de `ctx.context.returned`
  // sans exclure les APIError (voir node_modules/better-auth/dist/api/
  // dispatch.mjs - `returned` porte l'erreur elle-meme en cas d'echec, ce
  // n'est pas une `Response`). Corrige dans auth.ts via `isAPIError`. Ces
  // deux tests verifient qu'un echec ne declenche plus de fausse alerte.
  it("n'envoie pas la notification apres un changement de mot de passe refuse", async () => {
    const mail = testEmail('hook-echec-mdp');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));
    vi.mocked(email.sendPasswordChangedEmail).mockClear();

    const res = await auth.api.changePassword({
      body: { currentPassword: 'MauvaisPass123!', newPassword: 'PeuImporte123!' },
      headers: cj.headers(),
      asResponse: true,
    });

    expect(res.status).toBe(400);
    expect(email.sendPasswordChangedEmail).not.toHaveBeenCalled();
    // Le mot de passe, lui, n'a evidemment pas ete change.
    const connexion = await auth.api.signInEmail({ body: { email: mail, password: PASSWORD }, headers: new Headers(), asResponse: true });
    expect(connexion.status).toBe(200);
  });

  it("n'envoie pas la notification apres une deliaison refusee", async () => {
    const mail = testEmail('hook-echec-unlink');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    await prisma.account.create({
      data: { id: crypto.randomUUID(), providerId: 'google', accountId: `google-${user.id}`, userId: user.id },
    });
    vi.mocked(email.sendAccountUnlinkedEmail).mockClear();

    const res = await auth.api.unlinkAccount({ body: { providerId: 'microsoft' }, headers: cj.headers(), asResponse: true });

    expect(res.status).toBe(400);
    expect(email.sendAccountUnlinkedEmail).not.toHaveBeenCalled();
    // Aucun compte n'a reellement ete delie.
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(2);
  });
});
