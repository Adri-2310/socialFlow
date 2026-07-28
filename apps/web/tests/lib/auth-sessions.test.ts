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
 * Cree un compte et ouvre `nbAppareils` sessions distinctes : chaque cookie jar
 * joue le role d'un navigateur different (ordinateur, telephone...).
 */
async function ouvrirPlusieursSessions(label: string, nbAppareils: number) {
  const mail = testEmail(label);
  const jars = [cookieJar()];
  jars[0].apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

  for (let i = 1; i < nbAppareils; i += 1) {
    const jar = cookieJar();
    jar.apply(await auth.api.signInEmail({ body: { email: mail, password: PASSWORD }, headers: new Headers(), asResponse: true }));
    jars.push(jar);
  }
  return { mail, jars };
}

describe('sessions multi-appareils', () => {
  it('liste toutes les sessions actives du compte', async () => {
    const { jars } = await ouvrirPlusieursSessions('list', 3);

    const sessions = await auth.api.listSessions({ headers: jars[0].headers() });

    expect(sessions).toHaveLength(3);
    // Toutes les sessions listees appartiennent bien au meme utilisateur.
    const utilisateurs = new Set(sessions.map((s) => s.userId));
    expect(utilisateurs.size).toBe(1);
  });

  it("revoquer une session ne deconnecte pas les autres appareils", async () => {
    const { jars } = await ouvrirPlusieursSessions('revoke-une', 3);
    const cible = (await auth.api.getSession({ headers: jars[1].headers() }))!.session.token;

    const res = await auth.api.revokeSession({ body: { token: cible }, headers: jars[0].headers(), asResponse: true });
    expect(res.status).toBe(200);

    expect(await auth.api.getSession({ headers: jars[1].headers() })).toBeFalsy();
    expect(await auth.api.getSession({ headers: jars[0].headers() })).toBeTruthy();
    expect(await auth.api.getSession({ headers: jars[2].headers() })).toBeTruthy();
    expect(await auth.api.listSessions({ headers: jars[0].headers() })).toHaveLength(2);
  });

  it('revoquer les autres sessions conserve la session courante', async () => {
    const { jars } = await ouvrirPlusieursSessions('revoke-autres', 3);

    const res = await auth.api.revokeOtherSessions({ headers: jars[0].headers(), asResponse: true });
    jars[0].apply(res);
    expect(res.status).toBe(200);

    expect(await auth.api.getSession({ headers: jars[0].headers() })).toBeTruthy();
    expect(await auth.api.getSession({ headers: jars[1].headers() })).toBeFalsy();
    expect(await auth.api.getSession({ headers: jars[2].headers() })).toBeFalsy();
  });

  it('revoquer toutes les sessions deconnecte aussi l appareil courant', async () => {
    const { jars } = await ouvrirPlusieursSessions('revoke-toutes', 2);

    const res = await auth.api.revokeSessions({ headers: jars[0].headers(), asResponse: true });
    expect(res.status).toBe(200);

    expect(await auth.api.getSession({ headers: jars[0].headers() })).toBeFalsy();
    expect(await auth.api.getSession({ headers: jars[1].headers() })).toBeFalsy();
  });

  it('le changement de mot de passe avec revokeOtherSessions ne garde que la session courante', async () => {
    const { jars } = await ouvrirPlusieursSessions('change-pass-sessions', 2);

    const res = await auth.api.changePassword({
      body: { currentPassword: PASSWORD, newPassword: 'ToutNouveau123!', revokeOtherSessions: true },
      headers: jars[0].headers(),
      asResponse: true,
    });
    // La reponse porte le cookie de la nouvelle session : sans `apply`, le jar
    // conserverait l'ancien jeton, qui vient d'etre supprime.
    jars[0].apply(res);
    expect(res.status).toBe(200);

    expect(await auth.api.getSession({ headers: jars[0].headers() })).toBeTruthy();
    expect(await auth.api.getSession({ headers: jars[1].headers() })).toBeFalsy();
  });
});

describe('deconnexion', () => {
  it('invalide le cookie et bloque les actions sensibles', async () => {
    const mail = testEmail('signout');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));
    // On garde une copie des en-tetes d'avant la deconnexion pour simuler un
    // cookie vole/rejoue apres coup.
    const cookieAvant = cj.headers();

    const res = await auth.api.signOut({ headers: cj.headers(), asResponse: true });
    expect(res.status).toBe(200);

    expect(await auth.api.getSession({ headers: cookieAvant })).toBeFalsy();
    const rejeu = await auth.api.changePassword({
      body: { currentPassword: PASSWORD, newPassword: 'Rejoue12345!' },
      headers: cookieAvant,
      asResponse: true,
    });
    expect(rejeu.status).toBe(401);

    // Le mot de passe n'a evidemment pas ete modifie.
    const connexion = await auth.api.signInEmail({ body: { email: mail, password: PASSWORD }, headers: new Headers(), asResponse: true });
    expect(connexion.status).toBe(200);
  });

  it('une session supprimee en base ne donne plus acces a rien', async () => {
    const mail = testEmail('session-supprimee');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    await prisma.session.deleteMany({ where: { userId: user.id } });

    // La session est lue en base a chaque requete : aucun cache cookie ne
    // permet de survivre a une revocation cote serveur.
    expect(await auth.api.getSession({ headers: cj.headers() })).toBeFalsy();
    const res = await auth.api.listSessions({ headers: cj.headers(), asResponse: true });
    expect(res.status).toBe(401);
  });

  it('getSession sans cookie ne renvoie aucune session', async () => {
    expect(await auth.api.getSession({ headers: new Headers() })).toBeFalsy();
  });
});
