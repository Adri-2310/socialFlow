// @vitest-environment node
import { describe, it, expect, vi, afterAll } from 'vitest';
import { cookieJar, testEmail, TEST_EMAIL_PREFIX } from '../helpers/auth-test-utils';

vi.mock('@/lib/email/email', () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  sendOTPEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendChangeEmailConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendResetPasswordEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletedEmail: vi.fn().mockResolvedValue(undefined),
  sendDeleteAccountVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendGestionnaireInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendEntrepriseInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendGestionnaireAccessChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const { ensureCabinetSlug } = await import('@/lib/portal/cabinet-portal');

const PASSWORD = 'InitialPass123!';

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

async function creerCabinetRH(label: string) {
  const mail = testEmail(label).toLowerCase();
  await auth.api.signUpEmail({ body: { name: 'Titulaire Portail', email: mail, password: PASSWORD } });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { mail, user, slug: await ensureCabinetSlug(user.cabinetId!) };
}

/** Compte rattache a un cabinet avec le role donne, sans session ouverte. */
async function creerMembre(cabinetId: string, role: string, label: string) {
  const mail = testEmail(label).toLowerCase();
  await auth.api.signUpEmail({ body: { name: `Membre ${label}`, email: mail, password: PASSWORD } });
  const created = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  await prisma.user.update({ where: { id: created.id }, data: { role, cabinetId, emailVerified: true } });
  await prisma.cabinet.delete({ where: { id: created.cabinetId! } });
  await prisma.session.deleteMany({ where: { userId: created.id } });
  return { mail, id: created.id };
}

async function creerSuperAdmin(label: string) {
  const mail = testEmail(label).toLowerCase();
  await auth.api.signUpEmail({ body: { name: 'Super Portail', email: mail, password: PASSWORD } });
  const created = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  await prisma.user.update({ where: { id: created.id }, data: { role: 'SUPER_ADMIN', cabinetId: null } });
  await prisma.cabinet.delete({ where: { id: created.cabinetId! } });
  await prisma.session.deleteMany({ where: { userId: created.id } });
  return { mail, id: created.id };
}

const connexion = (mail: string, headers: Record<string, string> = {}) =>
  auth.api.signInEmail({
    body: { email: mail, password: PASSWORD },
    headers: new Headers(headers),
    asResponse: true,
  });

const portal = (slug: string) => ({ 'x-sf-portal': slug });

describe.each([
  ['GESTIONNAIRE_RH', 'gestionnaire'],
  ['ENTREPRISE_CLIENTE', 'administrateur d entreprise'],
  ['COLLABORATEUR', 'collaborateur'],
])('connexion d un %s (D76)', (role, _label) => {
  it('est refusee par la page de SocialFlow et renvoie vers le portail de son cabinet', async () => {
    const { user, slug } = await creerCabinetRH(`portail-${role}-refus`);
    const membre = await creerMembre(user.cabinetId!, role, `portail-${role}-m1`);

    const res = await connexion(membre.mail);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PORTAL_REQUIRED');
    // Le message est le chemin du portail : la personne a de bons identifiants.
    expect(body.message).toBe(`/connexion/${slug}`);
    // Aucune session ne subsiste.
    expect(await prisma.session.count({ where: { userId: membre.id } })).toBe(0);
  });

  it('reussit par le portail de son cabinet : en-tete, cookie ou adresse de retour', async () => {
    const { user, slug } = await creerCabinetRH(`portail-${role}-ok`);
    const membre = await creerMembre(user.cabinetId!, role, `portail-${role}-m2`);

    expect((await connexion(membre.mail, portal(slug))).status).toBe(200);
    expect((await connexion(membre.mail, { cookie: `sf-portal=${slug}` })).status).toBe(200);
  });

  it('est refusee sur le portail d un autre cabinet ou d un portail inconnu', async () => {
    const { user } = await creerCabinetRH(`portail-${role}-a`);
    const { slug: slugAutre } = await creerCabinetRH(`portail-${role}-b`);
    const membre = await creerMembre(user.cabinetId!, role, `portail-${role}-m3`);

    for (const slug of [slugAutre, 'portail-qui-nexiste-pas']) {
      const res = await connexion(membre.mail, portal(slug));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('WRONG_PORTAL');
    }
    expect(await prisma.session.count({ where: { userId: membre.id } })).toBe(0);
  });
});

describe('titulaire du cabinet et SuperAdmin (D76)', () => {
  it('le titulaire se connecte par SocialFlow, et par son propre portail, pas par celui d un autre', async () => {
    const { mail, slug } = await creerCabinetRH('portail-titulaire');
    const { slug: slugAutre } = await creerCabinetRH('portail-titulaire-autre');

    expect((await connexion(mail)).status).toBe(200);
    expect((await connexion(mail, portal(slug))).status).toBe(200);
    const res = await connexion(mail, portal(slugAutre));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('WRONG_PORTAL');
  });

  it('le SuperAdmin se connecte par SocialFlow et n entre dans aucun portail', async () => {
    const { slug } = await creerCabinetRH('portail-super-cabinet');
    const admin = await creerSuperAdmin('portail-super');

    expect((await connexion(admin.mail)).status).toBe(200);
    const res = await connexion(admin.mail, portal(slug));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('WRONG_PORTAL');
  });
});

describe('sessions et autres chemins de connexion (D76)', () => {
  it('un simple rafraichissement de session ne deconnecte jamais un compte de cabinet client', async () => {
    const { user, slug } = await creerCabinetRH('portail-refresh');
    const membre = await creerMembre(user.cabinetId!, 'GESTIONNAIRE_RH', 'portail-refresh-m');

    const cj = cookieJar();
    cj.apply(await connexion(membre.mail, portal(slug)));

    // Lecture de la session SANS annoncer le portail : elle reste valide.
    expect((await auth.api.getSession({ headers: cj.headers() }))?.user.id).toBe(membre.id);
    expect((await auth.api.getSession({ headers: cj.headers() }))?.user.id).toBe(membre.id);
  });

  async function lienMagique(mail: string, callbackURL: string) {
    await auth.api.signInMagicLink({
      body: { email: mail, callbackURL },
      headers: new Headers(),
      asResponse: true,
    });
    const verification = await prisma.verification.findFirstOrThrow({
      where: { value: { contains: mail } },
      orderBy: { createdAt: 'desc' },
    });
    return auth.api.magicLinkVerify({
      query: { token: verification.identifier, callbackURL },
      headers: new Headers(),
      asResponse: true,
    });
  }

  it('lien magique : accepte quand son adresse de retour est sous le portail du cabinet', async () => {
    const { user, slug } = await creerCabinetRH('portail-lien-ok');
    const membre = await creerMembre(user.cabinetId!, 'GESTIONNAIRE_RH', 'portail-lien-m1');

    const res = await lienMagique(membre.mail, `/connexion/${slug}/continuer`);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain(`/connexion/${slug}/continuer`);
    expect(await prisma.session.count({ where: { userId: membre.id } })).toBeGreaterThan(0);
  });

  it('lien magique : refuse hors portail, avec le portail a utiliser dans la redirection', async () => {
    const { user, slug } = await creerCabinetRH('portail-lien-refus');
    const membre = await creerMembre(user.cabinetId!, 'GESTIONNAIRE_RH', 'portail-lien-m2');

    const res = await lienMagique(membre.mail, '/bienvenue');

    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('error=portal_required');
    expect(location).toContain(`portal=${slug}`);
    expect(await prisma.session.count({ where: { userId: membre.id } })).toBe(0);
  });

  it('Google et Microsoft ne lient jamais un compte existant d elle-meme : liaison volontaire seulement', () => {
    expect(auth.options.account?.accountLinking?.disableImplicitLinking).toBe(true);
    // La liaison volontaire depuis le profil (linkSocial) n'est pas concernee par
    // cette option : elle reste possible pour un utilisateur deja connecte.
    expect(auth.options.account?.accountLinking?.allowDifferentEmails).toBe(true);
  });
});
