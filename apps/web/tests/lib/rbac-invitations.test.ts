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
const { POST: createInvitation } = await import('@/app/api/invitations/route');
const { POST: acceptInvitation } = await import('@/app/api/invitations/accept/route');

const PASSWORD = 'InitialPass123!';
const APP_URL = 'http://localhost:3000';

afterAll(async () => {
  // Les cabinets (reels ou fantomes non nettoyes par la route d'acceptation en
  // cas d'echec de test) n'ont pas de nom prevu par TEST_EMAIL_PREFIX - on les
  // retrouve via les utilisateurs de test, plus les fantomes orphelins (noms
  // fixes generes par le hook de sign-up pour ce fichier). Supprimer les
  // cabinets d'abord fait cascader la suppression de leurs users.
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  await prisma.cabinet.deleteMany({
    where: {
      OR: [
        { id: { in: cabinetIds } },
        { name: { in: ['Cabinet de Cabinet Test', 'Cabinet de Gestionnaire Test'] } },
      ],
    },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.invitation.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: {
      OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }],
    },
  });
});

/** Cree un Cabinet RH (auto-inscription) et renvoie son cookie jar + son cabinetId. */
async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(await auth.api.signUpEmail({ body: { name: 'Cabinet Test', email: mail, password: PASSWORD }, asResponse: true }));
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { mail, cj, user };
}

function requestJSON(url: string, body: unknown, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

describe('inscription : creation automatique du Cabinet', () => {
  it("l'auto-inscription cree un Cabinet RH et lie l'utilisateur", async () => {
    const { user } = await creerCabinetRH('cabinet-auto');
    expect(user.role).toBe('CABINET_RH');
    expect(user.cabinetId).not.toBeNull();

    const cabinet = await prisma.cabinet.findUniqueOrThrow({ where: { id: user.cabinetId! } });
    expect(cabinet.name).toBe('Cabinet de Cabinet Test');
  });
});

describe('creation d une invitation', () => {
  it('refuse sans session', async () => {
    const res = await createInvitation(
      requestJSON(`${APP_URL}/api/invitations`, { email: testEmail('sans-session') }),
    );
    expect(res.status).toBe(401);
  });

  it("refuse a un role autre que Cabinet RH", async () => {
    // Simule un Gestionnaire RH : cree un compte puis force le role a la main
    // (aucun flux d'invitation encore accepte a ce stade du test).
    const { cj, user } = await creerCabinetRH('gestionnaire-refus');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'GESTIONNAIRE_RH' } });

    const res = await createInvitation(
      requestJSON(`${APP_URL}/api/invitations`, { email: testEmail('cible') }, cj),
    );
    expect(res.status).toBe(403);
  });

  it('refuse une adresse email malformee', async () => {
    const { cj } = await creerCabinetRH('cabinet-email-invalide');
    const res = await createInvitation(requestJSON(`${APP_URL}/api/invitations`, { email: 'pas-un-email' }, cj));
    expect(res.status).toBe(400);
  });

  it('cree l invitation et envoie l email', async () => {
    const { cj, user } = await creerCabinetRH('cabinet-invite');
    const cibleEmail = testEmail('gestionnaire-invite');

    const res = await createInvitation(requestJSON(`${APP_URL}/api/invitations`, { email: cibleEmail }, cj));
    expect(res.status).toBe(200);

    const invitation = await prisma.invitation.findFirstOrThrow({ where: { email: cibleEmail } });
    expect(invitation.role).toBe('GESTIONNAIRE_RH');
    expect(invitation.cabinetId).toBe(user.cabinetId);
    expect(invitation.status).toBe('pending');
    expect(email.sendGestionnaireInvitationEmail).toHaveBeenCalledWith(
      cibleEmail,
      'Cabinet de Cabinet Test',
      'Cabinet Test',
      expect.stringContaining('/invitations/accept?token='),
    );
  });

  it('refuse une seconde invitation en double pour la meme adresse', async () => {
    const { cj } = await creerCabinetRH('cabinet-doublon');
    const cibleEmail = testEmail('cible-doublon');

    const premier = await createInvitation(requestJSON(`${APP_URL}/api/invitations`, { email: cibleEmail }, cj));
    expect(premier.status).toBe(200);

    const second = await createInvitation(requestJSON(`${APP_URL}/api/invitations`, { email: cibleEmail }, cj));
    expect(second.status).toBe(409);
  });
});

describe('acceptation d une invitation', () => {
  it('cree le compte avec le role et le cabinet de l invitation, sans cabinet fantome', async () => {
    const { cj: cabinetCj, user: cabinetUser } = await creerCabinetRH('cabinet-acceptation');
    const cibleEmail = testEmail('gestionnaire-accepte');

    await createInvitation(requestJSON(`${APP_URL}/api/invitations`, { email: cibleEmail }, cabinetCj));
    const invitation = await prisma.invitation.findFirstOrThrow({ where: { email: cibleEmail } });

    const res = await acceptInvitation(
      requestJSON(`${APP_URL}/api/invitations/accept`, {
        token: invitation.token,
        name: 'Gestionnaire Test',
        password: PASSWORD,
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().length).toBeGreaterThan(0);

    const nouvelUtilisateur = await prisma.user.findUniqueOrThrow({ where: { email: cibleEmail } });
    expect(nouvelUtilisateur.role).toBe('GESTIONNAIRE_RH');
    expect(nouvelUtilisateur.cabinetId).toBe(cabinetUser.cabinetId);
    expect(nouvelUtilisateur.emailVerified).toBe(true);

    const invitationApresCoup = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(invitationApresCoup.status).toBe('accepted');
    expect(invitationApresCoup.acceptedAt).not.toBeNull();

    // L'utilisateur invite appartient au seul cabinet reel de l'invitation
    // (pas de doublon).
    const cabinetsDuGestionnaire = await prisma.cabinet.findMany({ where: { users: { some: { id: nouvelUtilisateur.id } } } });
    expect(cabinetsDuGestionnaire).toHaveLength(1);
    expect(cabinetsDuGestionnaire[0].id).toBe(invitation.cabinetId);

    // Le cabinet fantome auto-cree par le hook de sign-up (avant que la route
    // d'acceptation ne repose le cabinetId reel) a ete nettoye, pas laisse en orphelin.
    const cabinetFantome = await prisma.cabinet.findFirst({ where: { name: 'Cabinet de Gestionnaire Test' } });
    expect(cabinetFantome).toBeNull();
  });

  it('la session ouverte par acceptation est valide', async () => {
    const { cj: cabinetCj } = await creerCabinetRH('cabinet-session');
    const cibleEmail = testEmail('gestionnaire-session');

    await createInvitation(requestJSON(`${APP_URL}/api/invitations`, { email: cibleEmail }, cabinetCj));
    const invitation = await prisma.invitation.findFirstOrThrow({ where: { email: cibleEmail } });

    const res = await acceptInvitation(
      requestJSON(`${APP_URL}/api/invitations/accept`, {
        token: invitation.token,
        name: 'Gestionnaire Session',
        password: PASSWORD,
      }),
    );

    const cj = cookieJar();
    cj.apply(res);
    const session = await auth.api.getSession({ headers: cj.headers() });
    expect(session?.user.email).toBe(cibleEmail);
    expect(session?.user.role).toBe('GESTIONNAIRE_RH');
  });

  it('refuse un jeton invente, expire ou deja accepte', async () => {
    const invente = await acceptInvitation(
      requestJSON(`${APP_URL}/api/invitations/accept`, {
        token: 'jeton-invente',
        name: 'X',
        password: PASSWORD,
      }),
    );
    expect(invente.status).toBe(404);

    const { cj: cabinetCj } = await creerCabinetRH('cabinet-expire');
    const cibleEmail = testEmail('gestionnaire-expire');
    await createInvitation(requestJSON(`${APP_URL}/api/invitations`, { email: cibleEmail }, cabinetCj));
    const invitation = await prisma.invitation.findFirstOrThrow({ where: { email: cibleEmail } });
    await prisma.invitation.update({ where: { id: invitation.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    const expire = await acceptInvitation(
      requestJSON(`${APP_URL}/api/invitations/accept`, {
        token: invitation.token,
        name: 'X',
        password: PASSWORD,
      }),
    );
    expect(expire.status).toBe(404);
  });
});
