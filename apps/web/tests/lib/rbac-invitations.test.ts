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
const { POST: resendInvitation } = await import('@/app/api/invitations/[id]/resend/route');
const { DELETE: revokeInvitation } = await import('@/app/api/invitations/[id]/route');
const { hashInvitationToken } = await import('@/lib/invitations');

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
  await prisma.pricingPlan.deleteMany({ where: { planId: { startsWith: 'vitest-quota-' } } });
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

/** Jeton en clair du dernier email d'invitation envoye a cette adresse (la base ne le stocke plus). */
function lastTokenSentTo(address: string): string {
  const calls = vi.mocked(email.sendGestionnaireInvitationEmail).mock.calls;
  const call = [...calls].reverse().find(([to]) => to === address);
  if (!call) throw new Error(`Aucun email d'invitation envoye a ${address}`);
  return new URL(call[3]).searchParams.get('token') as string;
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
    // C3 : seul le hash du jeton est en base, jamais le jeton lui-meme.
    expect(invitation.tokenHash).toBe(hashInvitationToken(lastTokenSentTo(cibleEmail)));
    expect(invitation.tokenHash).not.toBe(lastTokenSentTo(cibleEmail));
    expect(email.sendGestionnaireInvitationEmail).toHaveBeenCalledWith(
      cibleEmail,
      expect.objectContaining({ name: 'Cabinet de Cabinet Test' }),
      'Cabinet Test',
      expect.stringContaining('/invitations/accept?token='),
      null,
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

describe('quota d utilisateurs du plan (D15)', () => {
  async function creerPlan(label: string, maxUtilisateurs: number | null) {
    const planId = `vitest-quota-${label}-${Date.now()}`;
    await prisma.pricingPlan.create({
      data: { planId, name: planId, description: 'plan de test', features: ['test'], maxUtilisateurs },
    });
    return planId;
  }

  it('bloque une invitation qui depasserait le quota, en comptant les invitations en attente', async () => {
    const { cj, user } = await creerCabinetRH('quota-bloque');
    // D56 : le titulaire ne compte pas ; un plan a 1 gestionnaire n'autorise
    // qu'une seule invitation.
    await prisma.cabinet.update({
      where: { id: user.cabinetId! },
      data: { planId: await creerPlan('bloque', 1) },
    });

    const premier = await createInvitation(
      requestJSON(`${APP_URL}/api/invitations`, { email: testEmail('quota-un') }, cj),
    );
    expect(premier.status).toBe(200);

    const second = await createInvitation(
      requestJSON(`${APP_URL}/api/invitations`, { email: testEmail('quota-deux') }, cj),
    );
    expect(second.status).toBe(403);
    expect(await second.json()).toEqual({
      error: 'QUOTA_EXCEEDED',
      quota: 'maxUtilisateurs',
      limit: 1,
      used: 1,
    });
  });

  it('libere la place quand l invitation est revoquee', async () => {
    const { cj, user } = await creerCabinetRH('quota-revoque');
    await prisma.cabinet.update({
      where: { id: user.cabinetId! },
      data: { planId: await creerPlan('revoque', 1) },
    });
    const { invitation } = await inviter(cj, 'quota-revoque-cible');
    expect(
      (
        await createInvitation(
          requestJSON(`${APP_URL}/api/invitations`, { email: testEmail('quota-r2') }, cj),
        )
      ).status,
    ).toBe(403);

    await revokeInvitation(
      requestWith('DELETE', `${APP_URL}/api/invitations/${invitation.id}`, cj),
      ctx(invitation.id),
    );

    const apres = await createInvitation(
      requestJSON(`${APP_URL}/api/invitations`, { email: testEmail('quota-r3') }, cj),
    );
    expect(apres.status).toBe(200);
  });

  it('n applique aucune limite a un plan illimite ni a un cabinet sans plan', async () => {
    const { cj, user } = await creerCabinetRH('quota-illimite');
    await prisma.cabinet.update({
      where: { id: user.cabinetId! },
      data: { planId: await creerPlan('illimite', null) },
    });
    for (const label of ['quota-i1', 'quota-i2', 'quota-i3']) {
      const res = await createInvitation(
        requestJSON(`${APP_URL}/api/invitations`, { email: testEmail(label) }, cj),
      );
      expect(res.status).toBe(200);
    }

    const { cj: sansPlanCj } = await creerCabinetRH('quota-sans-plan');
    const res = await createInvitation(
      requestJSON(`${APP_URL}/api/invitations`, { email: testEmail('quota-sp') }, sansPlanCj),
    );
    expect(res.status).toBe(200);
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
        token: lastTokenSentTo(cibleEmail),
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

    // C6 : le compte n'est plus cree par l'auto-inscription, donc aucun cabinet
    // « fantome » n'est jamais cree (ni a nettoyer).
    const cabinetFantome = await prisma.cabinet.findFirst({ where: { name: 'Cabinet de Gestionnaire Test' } });
    expect(cabinetFantome).toBeNull();
  });

  it('ne cree aucun cabinet et laisse se connecter avec le mot de passe choisi (C6)', async () => {
    const { cj: cabinetCj } = await creerCabinetRH('cabinet-c6');
    const cibleEmail = testEmail('gestionnaire-c6');
    await createInvitation(requestJSON(`${APP_URL}/api/invitations`, { email: cibleEmail }, cabinetCj));
    const avant = await prisma.cabinet.count();

    const res = await acceptInvitation(
      requestJSON(`${APP_URL}/api/invitations/accept`, {
        token: lastTokenSentTo(cibleEmail),
        name: '  Gestionnaire C6  ',
        password: PASSWORD,
      }),
    );
    expect(res.status).toBe(200);
    expect(await prisma.cabinet.count()).toBe(avant);

    const utilisateur = await prisma.user.findUniqueOrThrow({ where: { email: cibleEmail } });
    expect(utilisateur.name).toBe('Gestionnaire C6');

    // Le compte « mot de passe » cree directement est bien reconnu par la connexion.
    const connexion = await auth.api.signInEmail({
      body: { email: cibleEmail, password: PASSWORD },
      asResponse: true,
    });
    expect(connexion.status).toBe(200);
    const mauvais = await auth.api.signInEmail({
      body: { email: cibleEmail, password: 'AutreMotDePasse1!' },
      asResponse: true,
    });
    expect(mauvais.status).not.toBe(200);
  });

  it('refuse un mot de passe trop court sans creer de compte ni consommer l invitation', async () => {
    const { cj: cabinetCj } = await creerCabinetRH('cabinet-mdp-court');
    const cibleEmail = testEmail('gestionnaire-mdp-court');
    await createInvitation(requestJSON(`${APP_URL}/api/invitations`, { email: cibleEmail }, cabinetCj));

    const res = await acceptInvitation(
      requestJSON(`${APP_URL}/api/invitations/accept`, {
        token: lastTokenSentTo(cibleEmail),
        name: 'Court',
        password: 'abc',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('PASSWORD_TOO_SHORT');
    expect(await prisma.user.count({ where: { email: cibleEmail } })).toBe(0);
    expect((await prisma.invitation.findFirstOrThrow({ where: { email: cibleEmail } })).status).toBe('pending');
  });

  it('refuse une adresse qui a deja un compte (D7) et une seconde acceptation du meme lien', async () => {
    const { cj: cabinetCj, user: titulaire } = await creerCabinetRH('cabinet-double');
    const cibleEmail = testEmail('gestionnaire-double');
    await createInvitation(requestJSON(`${APP_URL}/api/invitations`, { email: cibleEmail }, cabinetCj));
    const jeton = lastTokenSentTo(cibleEmail);
    const accepter = () =>
      acceptInvitation(
        requestJSON(`${APP_URL}/api/invitations/accept`, { token: jeton, name: 'Double', password: PASSWORD }),
      );

    expect((await accepter()).status).toBe(200);
    // Meme lien rejoue : plus valable, un seul compte.
    expect((await accepter()).status).toBe(404);
    expect(await prisma.user.count({ where: { email: cibleEmail } })).toBe(1);

    // Une invitation vers une adresse deja inscrite entre-temps est refusee.
    const { user: existant } = await creerCabinetRH('cabinet-double-existant');
    await prisma.invitation.create({
      data: {
        email: existant.email,
        role: 'GESTIONNAIRE_RH',
        tokenHash: hashInvitationToken('jeton-adresse-deja-inscrite'),
        cabinetId: titulaire.cabinetId!,
        invitedById: titulaire.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const deja = await acceptInvitation(
      requestJSON(`${APP_URL}/api/invitations/accept`, {
        token: 'jeton-adresse-deja-inscrite',
        name: 'Existant',
        password: PASSWORD,
      }),
    );
    expect(deja.status).toBe(409);
    expect((await deja.json()).error).toBe('EMAIL_ALREADY_USED');
  });

  it('la session ouverte par acceptation est valide', async () => {
    const { cj: cabinetCj } = await creerCabinetRH('cabinet-session');
    const cibleEmail = testEmail('gestionnaire-session');

    await createInvitation(requestJSON(`${APP_URL}/api/invitations`, { email: cibleEmail }, cabinetCj));
    const invitation = await prisma.invitation.findFirstOrThrow({ where: { email: cibleEmail } });

    const res = await acceptInvitation(
      requestJSON(`${APP_URL}/api/invitations/accept`, {
        token: lastTokenSentTo(cibleEmail),
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
        token: lastTokenSentTo(cibleEmail),
        name: 'X',
        password: PASSWORD,
      }),
    );
    expect(expire.status).toBe(404);
  });
});

function requestWith(method: 'POST' | 'DELETE', url: string, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = {};
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return new Request(url, { method, headers });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function inviter(cj: ReturnType<typeof cookieJar>, label: string) {
  const cible = testEmail(label);
  await createInvitation(requestJSON(`${APP_URL}/api/invitations`, { email: cible }, cj));
  const invitation = await prisma.invitation.findFirstOrThrow({ where: { email: cible } });
  return { cible, invitation };
}

describe('renvoi d une invitation', () => {
  const url = (id: string) => `${APP_URL}/api/invitations/${id}/resend`;

  it('refuse sans session et a un role autre que Cabinet RH', async () => {
    const { cj } = await creerCabinetRH('renvoi-proprietaire');
    const { invitation } = await inviter(cj, 'renvoi-cible-roles');

    const sans = await resendInvitation(requestWith('POST', url(invitation.id)), ctx(invitation.id));
    expect(sans.status).toBe(401);

    const { cj: autreCj, user } = await creerCabinetRH('renvoi-gestionnaire');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'GESTIONNAIRE_RH' } });
    const refuse = await resendInvitation(requestWith('POST', url(invitation.id), autreCj), ctx(invitation.id));
    expect(refuse.status).toBe(403);
  });

  it('renvoie 404 pour l invitation d un autre cabinet (isolation)', async () => {
    const { cj: cabinetA } = await creerCabinetRH('renvoi-cabinet-a');
    const { cj: cabinetB } = await creerCabinetRH('renvoi-cabinet-b');
    const { invitation } = await inviter(cabinetA, 'renvoi-cible-isolation');
    const avant = invitation.tokenHash;

    const res = await resendInvitation(requestWith('POST', url(invitation.id), cabinetB), ctx(invitation.id));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'INVITATION_NOT_FOUND' });

    const apres = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(apres.tokenHash).toBe(avant);
  });

  it('genere un nouveau jeton, repousse l echeance, invalide l ancien lien et audite', async () => {
    const { cj, user } = await creerCabinetRH('renvoi-ok');
    const { cible, invitation } = await inviter(cj, 'renvoi-cible-ok');
    const ancienJeton = lastTokenSentTo(cible);
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await resendInvitation(requestWith('POST', url(invitation.id), cj), ctx(invitation.id));
    expect(res.status).toBe(200);

    const apres = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    const nouveauJeton = lastTokenSentTo(cible);
    expect(nouveauJeton).not.toBe(ancienJeton);
    expect(apres.tokenHash).toBe(hashInvitationToken(nouveauJeton));
    expect(apres.status).toBe('pending');
    expect(apres.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const ancien = await acceptInvitation(
      requestJSON(`${APP_URL}/api/invitations/accept`, { token: ancienJeton, name: 'X', password: PASSWORD }),
    );
    expect(ancien.status).toBe(404);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'INVITATION_RESENT', cabinetId: user.cabinetId },
    });
    expect(audit.actorId).toBe(user.id);
    expect(audit.metadata).toMatchObject({ invitationId: invitation.id, email: cible });
  });

  it('refuse une invitation acceptee ou revoquee', async () => {
    const { cj } = await creerCabinetRH('renvoi-etats');
    const { invitation: acceptee } = await inviter(cj, 'renvoi-acceptee');
    const { invitation: revoquee } = await inviter(cj, 'renvoi-revoquee');
    await prisma.invitation.update({ where: { id: acceptee.id }, data: { status: 'accepted' } });
    await prisma.invitation.update({ where: { id: revoquee.id }, data: { status: 'revoked' } });

    const a = await resendInvitation(requestWith('POST', url(acceptee.id), cj), ctx(acceptee.id));
    expect(a.status).toBe(409);
    expect(await a.json()).toEqual({ error: 'INVITATION_ALREADY_ACCEPTED' });

    const r = await resendInvitation(requestWith('POST', url(revoquee.id), cj), ctx(revoquee.id));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: 'INVITATION_ALREADY_REVOKED' });
  });
});

describe('revocation d une invitation', () => {
  const url = (id: string) => `${APP_URL}/api/invitations/${id}`;

  it('refuse sans session et a un role autre que Cabinet RH', async () => {
    const { cj } = await creerCabinetRH('revoc-proprietaire');
    const { invitation } = await inviter(cj, 'revoc-cible-roles');

    const sans = await revokeInvitation(requestWith('DELETE', url(invitation.id)), ctx(invitation.id));
    expect(sans.status).toBe(401);

    const { cj: autreCj, user } = await creerCabinetRH('revoc-gestionnaire');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'GESTIONNAIRE_RH' } });
    const refuse = await revokeInvitation(requestWith('DELETE', url(invitation.id), autreCj), ctx(invitation.id));
    expect(refuse.status).toBe(403);
  });

  it('renvoie 404 pour l invitation d un autre cabinet (isolation)', async () => {
    const { cj: cabinetA } = await creerCabinetRH('revoc-cabinet-a');
    const { cj: cabinetB } = await creerCabinetRH('revoc-cabinet-b');
    const { invitation } = await inviter(cabinetA, 'revoc-cible-isolation');

    const res = await revokeInvitation(requestWith('DELETE', url(invitation.id), cabinetB), ctx(invitation.id));
    expect(res.status).toBe(404);

    const apres = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(apres.status).toBe('pending');
  });

  it('revoque, rend le lien inutilisable et audite', async () => {
    const { cj, user } = await creerCabinetRH('revoc-ok');
    const { cible, invitation } = await inviter(cj, 'revoc-cible-ok');
    const jeton = lastTokenSentTo(cible);

    const res = await revokeInvitation(requestWith('DELETE', url(invitation.id), cj), ctx(invitation.id));
    expect(res.status).toBe(200);

    const apres = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(apres.status).toBe('revoked');

    const accept = await acceptInvitation(
      requestJSON(`${APP_URL}/api/invitations/accept`, { token: jeton, name: 'X', password: PASSWORD }),
    );
    expect(accept.status).toBe(404);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'INVITATION_REVOKED', cabinetId: user.cabinetId },
    });
    expect(audit.actorId).toBe(user.id);
    expect(audit.metadata).toMatchObject({ invitationId: invitation.id, email: cible });
  });

  it('refuse une invitation deja acceptee ou deja revoquee', async () => {
    const { cj } = await creerCabinetRH('revoc-etats');
    const { invitation: acceptee } = await inviter(cj, 'revoc-acceptee');
    await prisma.invitation.update({ where: { id: acceptee.id }, data: { status: 'accepted' } });
    const a = await revokeInvitation(requestWith('DELETE', url(acceptee.id), cj), ctx(acceptee.id));
    expect(a.status).toBe(409);
    expect(await a.json()).toEqual({ error: 'INVITATION_ALREADY_ACCEPTED' });

    const { invitation } = await inviter(cj, 'revoc-deja');
    await revokeInvitation(requestWith('DELETE', url(invitation.id), cj), ctx(invitation.id));
    const encore = await revokeInvitation(requestWith('DELETE', url(invitation.id), cj), ctx(invitation.id));
    expect(encore.status).toBe(409);
    expect(await encore.json()).toEqual({ error: 'INVITATION_ALREADY_REVOKED' });
  });
});
