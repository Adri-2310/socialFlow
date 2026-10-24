// @vitest-environment node
import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import { cookieJar, testEmail, TEST_EMAIL_PREFIX } from '../../helpers/auth-test-utils';

// Meme convention que tests/lib/auth/auth.test.ts : Resend est entierement mocke,
// les tests parlent directement a `auth.api.*` (pas de serveur Next demarre).
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

// Un `plan` valide pose via signUpEmail/updateUser declenche le provisioning
// Stripe (voir provisionStripeTrial dans lib/stripe-trial.ts) : pas d'appel
// reseau reel vers le sandbox dans ces tests. Cabinet.stripeCustomerId est
// unique en base : chaque appel doit renvoyer un id different, sinon un
// deuxieme cabinet provisionne dans le meme fichier de test violerait la
// contrainte (et l'echec, avale par le best-effort de auth.ts, se
// manifesterait juste par un stripeCustomerId reste a null).
let customerCounter = 0;
const stripePricesList = vi.fn().mockResolvedValue({ data: [] });
const stripeCustomersCreate = vi.fn(() => Promise.resolve({ id: `cus_test_${++customerCounter}` }));
const stripeSubscriptionsCreate = vi.fn().mockResolvedValue({ id: 'sub_test' });
vi.mock('@/lib/billing/stripe', () => ({
  stripe: {
    prices: { list: stripePricesList },
    customers: { create: stripeCustomersCreate },
    subscriptions: { create: stripeSubscriptionsCreate },
  },
}));

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const { supprimerCabinetsEtDonnees } = await import('@/lib/cabinet/cabinet-purge');
const email = await import('@/lib/email/email');
const { POST: finalizeRoute } = await import('@/app/api/register/finalize/route');

const PASSWORD = 'InitialPass123!';

beforeEach(() => {
  stripePricesList.mockReset().mockResolvedValue({ data: [] });
  stripeCustomersCreate.mockReset().mockImplementation(() => Promise.resolve({ id: `cus_test_${++customerCounter}` }));
  stripeSubscriptionsCreate.mockReset().mockResolvedValue({ id: 'sub_test' });
});

afterAll(async () => {
  // Supprime les cabinets auto-crees a l'inscription avant les users (voir
  // meme commentaire dans tests/lib/auth/auth.test.ts).
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await supprimerCabinetsEtDonnees(cabinetIds);
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

  it('cree le compte et son Cabinet sans plan : le plan est pose apres coup par la finalisation', async () => {
    const mail = testEmail('signup-sans-plan');
    const res = await auth.api.signUpEmail({
      body: { name: 'X', cabinetName: 'Cabinet X', email: mail, password: PASSWORD },
      asResponse: true,
    });

    expect(res.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    expect(user.cabinetId).not.toBeNull();
    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: user.cabinetId! } });
    expect(cabinet.planId).toBeNull();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CABINET_CREATED', actorId: user.id },
    });
    expect(log.cabinetId).toBe(user.cabinetId);
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

  it("ignore un `plan` ou `billingPeriod` envoye a update-user : ils ne sont plus des champs de l'utilisateur (C2)", async () => {
    const mail = testEmail('update-user-plan');
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', email: mail, password: PASSWORD }, asResponse: true }));

    await auth.api.updateUser({
      body: { name: 'Nouveau nom', plan: 'enterprise', billingPeriod: 'yearly' },
      headers: cj.headers(),
      asResponse: true,
    } as never);

    // Le plan n'appartient qu'au cabinet (D55) et ne se pose que par la
    // finalisation : update-user n'y touche pas.
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    expect(user.name).toBe('Nouveau nom');
    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: user.cabinetId! } });
    expect(cabinet.planId).toBeNull();
    expect(cabinet.billingPeriod).toBeNull();
  });
});

function finaliser(body: unknown, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return finalizeRoute(
    new Request('http://localhost:3000/api/register/finalize', { method: 'POST', headers, body: JSON.stringify(body) }),
  );
}

describe('finalisation de l inscription du titulaire (D55, C2)', () => {
  async function inscrire(label: string, cabinetName = 'Cabinet X') {
    const mail = testEmail(label);
    const cj = cookieJar();
    cj.apply(await auth.api.signUpEmail({ body: { name: 'X', cabinetName, email: mail, password: PASSWORD }, asResponse: true }));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
    return { mail, cj, user };
  }

  it('refuse sans session (401) et a un role autre que Cabinet RH (403)', async () => {
    expect((await finaliser({ plan: 'starter' })).status).toBe(401);

    const { cj, user } = await inscrire('finalise-role');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'GESTIONNAIRE_RH' } });
    expect((await finaliser({ plan: 'starter' }, cj)).status).toBe(403);
  });

  it("pose le plan sur le cabinet cree a l'inscription, sans creer d'abonnement Stripe (D25)", async () => {
    const { cj, user } = await inscrire('finalise-plan');

    const res = await finaliser({ plan: 'enterprise', billingPeriod: 'yearly' }, cj);
    expect(res.status).toBe(200);
    expect((await res.json()).created).toBe(false);

    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: user.cabinetId! } });
    expect(cabinet.planId).toBe('enterprise');
    expect(cabinet.billingPeriod).toBe('yearly');
    expect(cabinet.billingStatus).toBe('EN_ATTENTE_PAIEMENT');
    expect(cabinet.stripeCustomerId).toBeNull();
    expect(stripeCustomersCreate).not.toHaveBeenCalled();
    expect(stripeSubscriptionsCreate).not.toHaveBeenCalled();
  });

  it('ignore un plan inexistant et une periode hors liste, sans erreur', async () => {
    const { cj, user } = await inscrire('finalise-invalide');

    expect((await finaliser({ plan: 'plan-inexistant', billingPeriod: 'hebdomadaire' }, cj)).status).toBe(200);

    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: user.cabinetId! } });
    expect(cabinet.planId).toBeNull();
    expect(cabinet.billingPeriod).toBeNull();

    // Plan valide, periode inconnue : mensuel par defaut.
    expect((await finaliser({ plan: 'starter', billingPeriod: 'hebdomadaire' }, cj)).status).toBe(200);
    expect((await prisma.cabinet.findUniqueOrThrow({ where: { id: user.cabinetId! } })).billingPeriod).toBe('monthly');
  });

  it('ne change pas le plan d un cabinet qui en a deja un (pas de quotas gratuits)', async () => {
    const { cj, user } = await inscrire('finalise-deja-pose');
    await finaliser({ plan: 'starter' }, cj);

    await finaliser({ plan: 'enterprise', billingPeriod: 'yearly' }, cj);

    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: user.cabinetId! } });
    expect(cabinet.planId).toBe('starter');
    expect(cabinet.billingPeriod).toBe('monthly');
  });

  it('cree le cabinet d un titulaire inscrit par Google ou Microsoft, une seule fois', async () => {
    // Compte tel que le laisse une inscription OAuth : aucun cabinet.
    const { cj, user } = await inscrire('finalise-oauth', 'Ignore');
    await prisma.user.update({ where: { id: user.id }, data: { cabinetId: null, cabinetName: null, name: 'Alice Martin' } });
    await supprimerCabinetsEtDonnees([user.cabinetId!]);

    const premiere = await finaliser({ plan: 'pro', billingPeriod: 'yearly' }, cj);
    expect(premiere.status).toBe(201);
    expect((await premiere.json()).created).toBe(true);

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(apres.cabinetId).not.toBeNull();
    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: apres.cabinetId! } });
    expect(cabinet.name).toBe('Cabinet de Alice Martin');
    expect(cabinet.planId).toBe('pro');
    expect(cabinet.billingPeriod).toBe('yearly');
    expect(cabinet.billingStatus).toBe('EN_ATTENTE_PAIEMENT');
    // Une seule entree pour le NOUVEAU cabinet (celle de l'inscription initiale
    // pointait vers le cabinet supprime pour simuler l'OAuth).
    expect(await prisma.auditLog.count({ where: { action: 'CABINET_CREATED', actorId: user.id, cabinetId: cabinet.id } })).toBe(1);

    // Rejoue (double rendu cote client) : aucun second cabinet.
    const seconde = await finaliser({ plan: 'pro', billingPeriod: 'yearly' }, cj);
    expect(seconde.status).toBe(200);
    expect((await seconde.json()).created).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).cabinetId).toBe(cabinet.id);
    expect(await prisma.auditLog.count({ where: { action: 'CABINET_CREATED', actorId: user.id, cabinetId: cabinet.id } })).toBe(1);
  });

  it('cree le cabinet sans plan quand le plan demande est invalide', async () => {
    const { cj, user } = await inscrire('finalise-oauth-invalide');
    await prisma.user.update({ where: { id: user.id }, data: { cabinetId: null } });
    await supprimerCabinetsEtDonnees([user.cabinetId!]);

    expect((await finaliser({ plan: 'plan-inexistant' }, cj)).status).toBe(201);

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: apres.cabinetId! } });
    expect(cabinet.planId).toBeNull();
  });
});
