// @vitest-environment node
import { describe, it, expect, vi, afterAll } from 'vitest';
import { cookieJar, testEmail, makeEmailVerificationJWT, TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

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

afterAll(async () => {
  // Supprime les cabinets auto-crees a l'inscription avant les users (voir
  // meme commentaire dans tests/lib/auth.test.ts).
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: {
      OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }],
    },
  });
});

/** Cree un compte deja verifie (etat requis pour le parcours en deux etapes). */
async function creerCompteVerifie(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));
  // On marque l'email comme verifie directement en base : le parcours de
  // verification lui-meme est deja couvert par tests/lib/auth.test.ts.
  await prisma.user.update({ where: { email: mail }, data: { emailVerified: true } });
  return { mail, cj };
}

describe("changement d'email", () => {
  it("ne divulgue pas qu'une adresse est deja prise et ne change rien", async () => {
    const { mail } = await creerCompteVerifie('ce-cible');
    const { mail: source, cj } = await creerCompteVerifie('ce-source');
    vi.mocked(email.sendChangeEmailConfirmationEmail).mockClear();

    const res = await auth.api.changeEmail({ body: { newEmail: mail }, headers: cj.headers(), asResponse: true });
    const body = await res.json();

    // Reponse volontairement identique au cas nominal : un attaquant ne peut
    // pas s'en servir pour tester l'existence d'une adresse.
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: true });
    // ... mais rien n'a bouge et aucun email de confirmation n'est parti.
    expect(await prisma.user.findUnique({ where: { email: source } })).not.toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { email: mail } })).name).toBe('X');
    expect(email.sendChangeEmailConfirmationEmail).not.toHaveBeenCalled();
  });

  it('refuse un changement vers sa propre adresse', async () => {
    const { mail, cj } = await creerCompteVerifie('ce-identique');

    const res = await auth.api.changeEmail({ body: { newEmail: mail }, headers: cj.headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toBe('Email is the same');
  });

  it('refuse un changement sans session', async () => {
    const res = await auth.api.changeEmail({
      body: { newEmail: testEmail('ce-anonyme') },
      headers: new Headers(),
      asResponse: true,
    });

    expect(res.status).toBe(401);
  });

  it("envoie la verification directement a la nouvelle adresse si l'email actuel n'est pas verifie", async () => {
    const mail = testEmail('ce-non-verifie');
    const nouvelle = testEmail('ce-non-verifie-new');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));
    vi.mocked(email.sendChangeEmailConfirmationEmail).mockClear();
    vi.mocked(email.sendVerificationEmail).mockClear();

    const res = await auth.api.changeEmail({ body: { newEmail: nouvelle }, headers: cj.headers(), asResponse: true });
    expect(res.status).toBe(200);

    // Une adresse non verifiee ne peut rien confirmer : la double etape
    // "ancienne puis nouvelle adresse" est remplacee par un simple envoi a la
    // nouvelle adresse.
    expect(email.sendChangeEmailConfirmationEmail).not.toHaveBeenCalled();
    expect(email.sendVerificationEmail).toHaveBeenCalledWith(nouvelle, expect.stringContaining('token='));
    // Tant que le lien n'est pas clique, l'adresse reste inchangee.
    expect(await prisma.user.findUnique({ where: { email: nouvelle } })).toBeNull();
  });
});

describe("finalisation du changement d'email", () => {
  it('fonctionne sans session (lien ouvert dans un autre navigateur)', async () => {
    const { mail } = await creerCompteVerifie('ce-finalise-anonyme');
    const nouvelle = testEmail('ce-finalise-anonyme-new');

    const token = await makeEmailVerificationJWT(mail, nouvelle, 'change-email-verification');
    const res = await auth.api.verifyEmail({ query: { token }, headers: new Headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.email).toBe(nouvelle);
    expect(await prisma.user.findUnique({ where: { email: mail } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: nouvelle } })).not.toBeNull();
  });

  it("est refusee depuis la session d'un autre compte", async () => {
    const { mail } = await creerCompteVerifie('ce-victime');
    const nouvelle = testEmail('ce-victime-new');
    const { cj: cjAttaquant } = await creerCompteVerifie('ce-attaquant');

    // Un lien intercepte ne doit pas pouvoir etre "finalise" par quelqu'un
    // d'autre, meme connecte a son propre compte.
    const token = await makeEmailVerificationJWT(mail, nouvelle, 'change-email-verification');
    const res = await auth.api.verifyEmail({ query: { token }, headers: cjAttaquant.headers(), asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('INVALID_USER');
    expect(await prisma.user.findUnique({ where: { email: mail } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { email: nouvelle } })).toBeNull();
  });

  it("la premiere etape (confirmation) ne modifie pas encore l'adresse", async () => {
    const { mail, cj } = await creerCompteVerifie('ce-etape1');
    const nouvelle = testEmail('ce-etape1-new');
    vi.mocked(email.sendVerificationEmail).mockClear();

    const token = await makeEmailVerificationJWT(mail, nouvelle, 'change-email-confirmation');
    const res = await auth.api.verifyEmail({ query: { token }, headers: cj.headers(), asResponse: true });

    expect(res.status).toBe(200);
    // Le clic sur le lien envoye a l'ANCIENNE adresse declenche seulement
    // l'envoi du second lien, vers la nouvelle adresse.
    expect(email.sendVerificationEmail).toHaveBeenCalledWith(nouvelle, expect.stringContaining('token='));
    expect(await prisma.user.findUnique({ where: { email: mail } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { email: nouvelle } })).toBeNull();
  });
});
