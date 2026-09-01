// @vitest-environment node
import { describe, it, expect, vi, afterAll } from 'vitest';
import { cookieJar, testEmail, TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

// Meme convention que tests/lib/auth.test.ts : Resend est entierement mocke,
// les tests parlent directement a `auth.api.*` (pas de serveur Next demarre).
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
  // La table Verification n'a aucune relation vers User (voir schema.prisma) :
  // ses lignes ne sont donc pas supprimees en cascade et doivent etre
  // nettoyees a la main, sinon la base de dev accumule des orphelines.
  await prisma.verification.deleteMany({
    where: {
      OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }],
    },
  });
});

describe('inscription : entrees invalides', () => {
  it('refuse une adresse deja inscrite sans creer de doublon', async () => {
    const mail = testEmail('dup');
    await auth.api.signUpEmail({ body: { name: 'Premier', email: mail, password: PASSWORD } });

    const res = await auth.api.signUpEmail({
      body: { name: 'Second', email: mail, password: 'UnAutrePass123!' },
      asResponse: true,
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.code).toBe('USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL');
    expect(await prisma.user.count({ where: { email: mail } })).toBe(1);
    // Le compte d'origine n'a pas ete ecrase par la seconde tentative.
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    expect(user.name).toBe('Premier');
  });

  it('refuse un mot de passe trop court (minimum better-auth : 8 caracteres)', async () => {
    const mail = testEmail('court');
    const res = await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: 'court7c' }, asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('PASSWORD_TOO_SHORT');
    expect(await prisma.user.findUnique({ where: { email: mail } })).toBeNull();
  });

  it('refuse un mot de passe trop long (maximum : 128 caracteres)', async () => {
    const mail = testEmail('long');
    const res = await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: 'a'.repeat(129) }, asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('PASSWORD_TOO_LONG');
    expect(await prisma.user.findUnique({ where: { email: mail } })).toBeNull();
  });

  it('refuse une adresse email malformee', async () => {
    const res = await auth.api.signUpEmail({ body: { name: 'X', email: 'pas-un-email', password: PASSWORD }, asResponse: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.user.findUnique({ where: { email: 'pas-un-email' } })).toBeNull();
  });
});

describe('connexion : pas de divulgation des comptes existants', () => {
  it('renvoie exactement la meme erreur pour un email inconnu et pour un mauvais mot de passe', async () => {
    const mail = testEmail('enum');
    await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD } });

    const inconnu = await auth.api.signInEmail({
      body: { email: testEmail('enum-inconnu'), password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    const mauvaisMdp = await auth.api.signInEmail({
      body: { email: mail, password: 'MauvaisPass123!' },
      headers: new Headers(),
      asResponse: true,
    });

    // Statut ET corps identiques : impossible de deduire si l'adresse existe.
    expect(inconnu.status).toBe(401);
    expect(mauvaisMdp.status).toBe(401);
    expect(await inconnu.json()).toEqual(await mauvaisMdp.json());
  });

  it('repond la meme chose a une demande de reinitialisation pour un email inconnu', async () => {
    const connu = testEmail('reset-connu');
    const inconnu = testEmail('reset-inconnu');
    await auth.api.signUpEmail({ body: { name: 'X', email: connu, password: PASSWORD } });

    const resConnu = await auth.api.requestPasswordReset({
      body: { email: connu, redirectTo: '/reinitialiser-mot-de-passe' },
      headers: new Headers(),
      asResponse: true,
    });
    const resInconnu = await auth.api.requestPasswordReset({
      body: { email: inconnu, redirectTo: '/reinitialiser-mot-de-passe' },
      headers: new Headers(),
      asResponse: true,
    });

    expect(resInconnu.status).toBe(200);
    expect(await resInconnu.json()).toEqual(await resConnu.json());
    // Mais aucun email n'est reellement parti pour l'adresse inconnue.
    expect(email.sendResetPasswordEmail).toHaveBeenCalledWith(connu, expect.any(String));
    expect(email.sendResetPasswordEmail).not.toHaveBeenCalledWith(inconnu, expect.any(String));
  });
});

describe('profil : champs acceptes et refuses', () => {
  it("refuse de modifier l'email via update-user (le parcours dedie change-email est obligatoire)", async () => {
    const mail = testEmail('upd-email');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    const res = await auth.api.updateUser({
      body: { email: testEmail('upd-email-cible') },
      headers: cj.headers(),
      asResponse: true,
    } as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('EMAIL_CAN_NOT_BE_UPDATED');
    expect(await prisma.user.findUniqueOrThrow({ where: { email: mail } })).toBeTruthy();
  });

  it('refuse une modification de profil sans session', async () => {
    const res = await auth.api.updateUser({ body: { name: 'Anonyme' }, headers: new Headers(), asResponse: true });

    expect(res.status).toBe(401);
  });

  it("refuse une valeur de `plan` ou `billingPeriod` hors de l'enum autorise", async () => {
    const mail = testEmail('plan-invalide');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    // Empeche un utilisateur connecte de s'auto-attribuer une formule
    // arbitraire via update-user (voir doc/analysis/AUDIT_SECURITE_AUTH.md,
    // finding #2).
    const resPlan = await auth.api.updateUser({
      body: { plan: 'plan-inexistant' },
      headers: cj.headers(),
      asResponse: true,
    });
    expect(resPlan.status).toBe(400);
    expect((await resPlan.json()).code).toBe('VALIDATION_ERROR');

    const resBilling = await auth.api.updateUser({
      body: { billingPeriod: 'hebdomadaire' },
      headers: cj.headers(),
      asResponse: true,
    });
    expect(resBilling.status).toBe(400);
    expect((await resBilling.json()).code).toBe('VALIDATION_ERROR');

    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    expect(user.plan).toBeNull();
    expect(user.billingPeriod).toBe('monthly');
  });

  it('accepte une valeur de `plan` et `billingPeriod` faisant partie de l enum', async () => {
    const mail = testEmail('plan-valide');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    const res = await auth.api.updateUser({
      body: { plan: 'enterprise', billingPeriod: 'yearly' },
      headers: cj.headers(),
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    expect(user.plan).toBe('enterprise');
    expect(user.billingPeriod).toBe('yearly');
  });
});
