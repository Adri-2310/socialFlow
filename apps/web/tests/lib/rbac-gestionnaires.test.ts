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
  sendGestionnaireAccessChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth');
const { ensureCabinetSlug } = await import('@/lib/cabinet-portal');
const { prisma } = await import('@/lib/prisma');
const email = await import('@/lib/email');
const {
  PATCH: patchGestionnaire,
  DELETE: deleteGestionnaire,
  PUT: restoreGestionnaire,
} = await import(
  '@/app/api/gestionnaires/[id]/route'
);
const { PATCH: patchAdminUser } = await import('@/app/api/admin/users/[id]/route');
const { POST: changeGestionnaireEmail } = await import('@/app/api/gestionnaires/[id]/email/route');

// D76 : un gestionnaire ne se connecte que par le portail de son cabinet.
async function portalHeaders(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
  return new Headers({ 'x-sf-portal': await ensureCabinetSlug(user.cabinetId!) });
}

const PASSWORD = 'InitialPass123!';
const APP_URL = 'http://localhost:3000';

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
  await prisma.pricingPlan.deleteMany({ where: { planId: { startsWith: 'vitest-quota-' } } });
});

async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: 'Cabinet Gestion Test', email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { mail, cj, user };
}

/** Cree un gestionnaire (avec mot de passe et session) rattache au cabinet donne. */
async function creerGestionnaire(cabinetId: string, label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: 'Gestionnaire Test', email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const created = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  const phantomCabinetId = created.cabinetId!;
  await prisma.user.update({
    where: { id: created.id },
    data: { role: 'GESTIONNAIRE_RH', cabinetId },
  });
  await prisma.cabinet.delete({ where: { id: phantomCabinetId } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
  return { mail, cj, user };
}

async function creerSuperAdmin(label: string) {
  const { mail, cj, user } = await creerCabinetRH(label);
  const cabinetId = user.cabinetId!;
  await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN', cabinetId: null } });
  await prisma.cabinet.delete({ where: { id: cabinetId } });
  return { mail, cj, user };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function patch(id: string, status: unknown, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return patchGestionnaire(
    new Request(`${APP_URL}/api/gestionnaires/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status }),
    }),
    ctx(id),
  );
}

function del(id: string, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = {};
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return deleteGestionnaire(
    new Request(`${APP_URL}/api/gestionnaires/${id}`, { method: 'DELETE', headers }),
    ctx(id),
  );
}

function put(id: string, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = {};
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return restoreGestionnaire(
    new Request(`${APP_URL}/api/gestionnaires/${id}`, { method: 'PUT', headers }),
    ctx(id),
  );
}

describe('suspension d un gestionnaire (D52)', () => {
  it('refuse sans session et a un role autre que Cabinet RH', async () => {
    const { user: titulaire } = await creerCabinetRH('gest-roles');
    const { user: cible } = await creerGestionnaire(titulaire.cabinetId!, 'gest-roles-cible');

    expect((await patch(cible.id, 'suspendu')).status).toBe(401);

    const { cj: autre, user } = await creerGestionnaire(titulaire.cabinetId!, 'gest-roles-autre');
    expect(user.role).toBe('GESTIONNAIRE_RH');
    const refuse = await patch(cible.id, 'suspendu', autre);
    expect(refuse.status).toBe(403);
  });

  it('renvoie 404 pour un gestionnaire d un autre cabinet (isolation)', async () => {
    const { cj: cabinetA } = await creerCabinetRH('gest-iso-a');
    const { user: titulaireB } = await creerCabinetRH('gest-iso-b');
    const { user: cibleB } = await creerGestionnaire(titulaireB.cabinetId!, 'gest-iso-cible');

    const suspendre = await patch(cibleB.id, 'suspendu', cabinetA);
    expect(suspendre.status).toBe(404);
    expect(await suspendre.json()).toEqual({ error: 'GESTIONNAIRE_NOT_FOUND' });

    const retirer = await del(cibleB.id, cabinetA);
    expect(retirer.status).toBe(404);

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: cibleB.id } });
    expect(apres.status).toBe('actif');
    expect(apres.deletedAt).toBeNull();
  });

  it('ne permet pas de cibler un utilisateur qui n est pas gestionnaire', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('gest-role-cible');
    const res = await patch(titulaire.id, 'suspendu', cj);
    expect(res.status).toBe(404);
  });

  it('refuse un statut invalide', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('gest-statut');
    const { user: cible } = await creerGestionnaire(titulaire.cabinetId!, 'gest-statut-cible');
    const res = await patch(cible.id, 'archive', cj);
    expect(res.status).toBe(400);
  });

  it('suspend : coupe les sessions, journalise, previent l utilisateur et affiche le message cabinet a la connexion', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('gest-suspend');
    const { mail, cj: cibleCj, user: cible } = await creerGestionnaire(
      titulaire.cabinetId!,
      'gest-suspend-cible',
    );
    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeTruthy();

    const res = await patch(cible.id, 'suspendu', cj);
    expect(res.status).toBe(200);

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: cible.id } });
    expect(apres.status).toBe('suspendu');
    expect(apres.suspendedBy).toBe('CABINET_RH');
    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeFalsy();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'USER_SUSPENDED', targetUserId: cible.id },
    });
    expect(log.actorId).toBe(titulaire.id);
    expect(log.cabinetId).toBe(titulaire.cabinetId);

    expect(email.sendGestionnaireAccessChangedEmail).toHaveBeenCalledWith(
      mail,
      'Gestionnaire Test',
      expect.objectContaining({ name: 'Cabinet de Cabinet Gestion Test' }),
      'suspended',
    );

    const connexion = await auth.api.signInEmail({
      body: { email: mail, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    expect(connexion.status).toBe(403);
    expect((await connexion.json()).code).toBe('USER_SUSPENDED_BY_CABINET');
  });

  it('refuse de suspendre deux fois', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('gest-double');
    const { user: cible } = await creerGestionnaire(titulaire.cabinetId!, 'gest-double-cible');
    await patch(cible.id, 'suspendu', cj);

    const res = await patch(cible.id, 'suspendu', cj);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'GESTIONNAIRE_ALREADY_SUSPENDED' });
  });

  it('reactive, journalise, previent l utilisateur et rend l acces', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('gest-reactive');
    const { mail, user: cible } = await creerGestionnaire(titulaire.cabinetId!, 'gest-reactive-cible');
    await patch(cible.id, 'suspendu', cj);

    const res = await patch(cible.id, 'actif', cj);
    expect(res.status).toBe(200);

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: cible.id } });
    expect(apres.status).toBe('actif');
    expect(apres.suspendedBy).toBeNull();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'USER_REACTIVATED', targetUserId: cible.id },
    });
    expect(log.actorId).toBe(titulaire.id);
    expect(email.sendGestionnaireAccessChangedEmail).toHaveBeenCalledWith(
      mail,
      'Gestionnaire Test',
      expect.objectContaining({ name: 'Cabinet de Cabinet Gestion Test' }),
      'reactivated',
    );

    const connexion = await auth.api.signInEmail({
      body: { email: mail, password: PASSWORD },
      headers: await portalHeaders(mail),
      asResponse: true,
    });
    expect(connexion.status).toBe(200);

    const encore = await patch(cible.id, 'actif', cj);
    expect(encore.status).toBe(409);
    expect(await encore.json()).toEqual({ error: 'GESTIONNAIRE_ALREADY_ACTIVE' });
  });

  it('ne leve pas une suspension posee par le SuperAdmin, et garde son message d origine', async () => {
    const { cj: adminCj } = await creerSuperAdmin('gest-admin');
    const { cj, user: titulaire } = await creerCabinetRH('gest-par-admin');
    const { mail, user: cible } = await creerGestionnaire(titulaire.cabinetId!, 'gest-par-admin-cible');

    const headers = { 'content-type': 'application/json', cookie: adminCj.headers().get('cookie')! };
    const suspendu = await patchAdminUser(
      new Request(`${APP_URL}/api/admin/users/${cible.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'suspendu' }),
      }),
      ctx(cible.id),
    );
    expect(suspendu.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: cible.id } })).suspendedBy).toBe(
      'SUPER_ADMIN',
    );

    const res = await patch(cible.id, 'actif', cj);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'SUSPENDED_BY_ADMIN' });

    const connexion = await auth.api.signInEmail({
      body: { email: mail, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    expect((await connexion.json()).code).toBe('USER_SUSPENDED');
  });

  it('traite une suspension sans auteur enregistre comme celle du SuperAdmin', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('gest-sans-auteur');
    const { user: cible } = await creerGestionnaire(titulaire.cabinetId!, 'gest-sans-auteur-cible');
    await prisma.user.update({
      where: { id: cible.id },
      data: { status: 'suspendu', suspendedBy: null },
    });

    const res = await patch(cible.id, 'actif', cj);
    expect(res.status).toBe(403);
  });
});

describe('archivage d un gestionnaire (D52)', () => {
  it('archive, coupe les sessions, journalise et previent l utilisateur', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('gest-archive');
    const { mail, cj: cibleCj, user: cible } = await creerGestionnaire(
      titulaire.cabinetId!,
      'gest-archive-cible',
    );
    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeTruthy();

    const res = await del(cible.id, cj);
    expect(res.status).toBe(200);

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: cible.id } });
    expect(apres.deletedAt).not.toBeNull();
    expect(apres.deletedBy).toBe('CABINET_RH');
    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeFalsy();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'USER_ARCHIVED', targetUserId: cible.id },
    });
    expect(log.actorId).toBe(titulaire.id);
    expect(log.cabinetId).toBe(titulaire.cabinetId);
    expect(email.sendGestionnaireAccessChangedEmail).toHaveBeenCalledWith(
      mail,
      'Gestionnaire Test',
      expect.objectContaining({ name: 'Cabinet de Cabinet Gestion Test' }),
      'archived',
    );

    // Un gestionnaire deja archive n'est plus dans le perimetre.
    const encore = await del(cible.id, cj);
    expect(encore.status).toBe(404);
  });
});

function postEmail(id: string, newEmail: unknown, cj?: ReturnType<typeof cookieJar>) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return changeGestionnaireEmail(
    new Request(`${APP_URL}/api/gestionnaires/${id}/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: newEmail }),
    }),
    ctx(id),
  );
}

describe('modification de l email d un gestionnaire (D53)', () => {
  it('refuse sans session et a un role autre que Cabinet RH', async () => {
    const { user: titulaire } = await creerCabinetRH('email-roles');
    const { user: cible } = await creerGestionnaire(titulaire.cabinetId!, 'email-roles-cible');

    expect((await postEmail(cible.id, testEmail('nouvelle'))).status).toBe(401);

    const { cj: gestionnaireCj } = await creerGestionnaire(titulaire.cabinetId!, 'email-roles-autre');
    const refuse = await postEmail(cible.id, testEmail('nouvelle'), gestionnaireCj);
    expect(refuse.status).toBe(403);
  });

  it('renvoie 404 pour un gestionnaire d un autre cabinet (isolation)', async () => {
    const { cj: cabinetA } = await creerCabinetRH('email-iso-a');
    const { user: titulaireB } = await creerCabinetRH('email-iso-b');
    const { user: cibleB } = await creerGestionnaire(titulaireB.cabinetId!, 'email-iso-cible');
    const avant = cibleB.email;

    const res = await postEmail(cibleB.id, testEmail('pirate'), cabinetA);
    expect(res.status).toBe(404);

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: cibleB.id } });
    expect(apres.email).toBe(avant);
  });

  it('refuse une adresse invalide, identique ou deja utilisee', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('email-refus');
    const { user: cible } = await creerGestionnaire(titulaire.cabinetId!, 'email-refus-cible');
    const { mail: autreMail } = await creerGestionnaire(titulaire.cabinetId!, 'email-refus-autre');

    const invalide = await postEmail(cible.id, 'pas-un-email', cj);
    expect(invalide.status).toBe(400);
    expect(await invalide.json()).toEqual({ error: 'INVALID_EMAIL' });

    const identique = await postEmail(cible.id, cible.email.toUpperCase(), cj);
    expect(identique.status).toBe(400);
    expect(await identique.json()).toEqual({ error: 'EMAIL_UNCHANGED' });

    const utilisee = await postEmail(cible.id, autreMail, cj);
    expect(utilisee.status).toBe(409);
    expect(await utilisee.json()).toEqual({ error: 'EMAIL_ALREADY_USED' });
  });

  it('modifie l adresse, la remet a non verifiee, coupe les sessions, previent et journalise', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('email-ok');
    const { mail: ancienne, cj: cibleCj, user: cible } = await creerGestionnaire(
      titulaire.cabinetId!,
      'email-ok-cible',
    );
    await prisma.user.update({ where: { id: cible.id }, data: { emailVerified: true } });
    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeTruthy();
    const nouvelle = testEmail('email-ok-nouvelle');

    const res = await postEmail(cible.id, nouvelle.toUpperCase(), cj);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, verificationEmailSent: true });

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: cible.id } });
    expect(apres.email).toBe(nouvelle);
    expect(apres.emailVerified).toBe(false);
    expect(await auth.api.getSession({ headers: cibleCj.headers() })).toBeFalsy();

    // Confirmation envoyee a la NOUVELLE adresse, information a l'ANCIENNE.
    expect(email.sendVerificationEmail).toHaveBeenCalledWith(nouvelle, expect.any(String));
    expect(email.sendGestionnaireAccessChangedEmail).toHaveBeenCalledWith(
      ancienne,
      'Gestionnaire Test',
      expect.objectContaining({ name: 'Cabinet de Cabinet Gestion Test' }),
      'email_changed',
    );

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'USER_EMAIL_CHANGED', targetUserId: cible.id },
    });
    expect(log.actorId).toBe(titulaire.id);
    expect(log.cabinetId).toBe(titulaire.cabinetId);
    expect(log.metadata).toEqual({ previousEmail: ancienne, newEmail: nouvelle });

    // L'ancienne adresse ne permet plus de se connecter ; la nouvelle oui,
    // sans attendre la confirmation (verification "souple").
    const ancienneConnexion = await auth.api.signInEmail({
      body: { email: ancienne, password: PASSWORD },
      headers: new Headers(),
      asResponse: true,
    });
    expect(ancienneConnexion.status).toBe(401);
    const nouvelleConnexion = await auth.api.signInEmail({
      body: { email: nouvelle, password: PASSWORD },
      headers: await portalHeaders(nouvelle),
      asResponse: true,
    });
    expect(nouvelleConnexion.status).toBe(200);
  });
});

describe('restauration d un gestionnaire retire (D52)', () => {
  it('refuse sans session', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('rest-sans-session');
    const { user: cible } = await creerGestionnaire(titulaire.cabinetId!, 'rest-sans-session-cible');
    await del(cible.id, cj);

    expect((await put(cible.id)).status).toBe(401);
  });

  it('restaure dans le delai, journalise, previent et rend l acces', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('rest-ok');
    const { mail, user: cible } = await creerGestionnaire(titulaire.cabinetId!, 'rest-ok-cible');
    await del(cible.id, cj);

    const res = await put(cible.id, cj);
    expect(res.status).toBe(200);

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: cible.id } });
    expect(apres.deletedAt).toBeNull();
    expect(apres.deletedBy).toBeNull();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'USER_RESTORED', targetUserId: cible.id },
    });
    expect(log.actorId).toBe(titulaire.id);
    expect(log.cabinetId).toBe(titulaire.cabinetId);
    expect(email.sendGestionnaireAccessChangedEmail).toHaveBeenCalledWith(
      mail,
      'Gestionnaire Test',
      expect.objectContaining({ name: 'Cabinet de Cabinet Gestion Test' }),
      'restored',
    );

    const connexion = await auth.api.signInEmail({
      body: { email: mail, password: PASSWORD },
      headers: await portalHeaders(mail),
      asResponse: true,
    });
    expect(connexion.status).toBe(200);
  });

  it('refuse au dela du delai de 30 jours', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('rest-expire');
    const { user: cible } = await creerGestionnaire(titulaire.cabinetId!, 'rest-expire-cible');
    await del(cible.id, cj);
    await prisma.user.update({
      where: { id: cible.id },
      data: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });

    const res = await put(cible.id, cj);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'RESTORE_WINDOW_EXPIRED' });

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: cible.id } });
    expect(apres.deletedAt).not.toBeNull();
  });

  it('refuse un compte supprime par la personne ou archive par le SuperAdmin', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('rest-origine');
    const { user: parLuiMeme } = await creerGestionnaire(titulaire.cabinetId!, 'rest-origine-self');
    const { user: parAdmin } = await creerGestionnaire(titulaire.cabinetId!, 'rest-origine-admin');
    await prisma.user.update({
      where: { id: parLuiMeme.id },
      data: { deletedAt: new Date(), deletedBy: null },
    });
    await prisma.user.update({
      where: { id: parAdmin.id },
      data: { deletedAt: new Date(), deletedBy: 'SUPER_ADMIN' },
    });

    for (const id of [parLuiMeme.id, parAdmin.id]) {
      const res = await put(id, cj);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'RESTORE_NOT_ALLOWED' });
    }
  });

  it('refuse de restaurer quand le quota d utilisateurs est atteint (D15)', async () => {
    const { cj, user: titulaire } = await creerCabinetRH('rest-quota');
    const planId = `vitest-quota-rest-${Date.now()}`;
    await prisma.pricingPlan.create({
      data: { planId, name: planId, description: 'plan de test', features: ['test'], maxUtilisateurs: 1 },
    });
    await prisma.cabinet.update({ where: { id: titulaire.cabinetId! }, data: { planId } });

    const { user: retire } = await creerGestionnaire(titulaire.cabinetId!, 'rest-quota-retire');
    await del(retire.id, cj);
    // Une place est reprise par un autre gestionnaire : 1/1 (le titulaire ne compte pas, D56).
    await creerGestionnaire(titulaire.cabinetId!, 'rest-quota-autre');

    const res = await put(retire.id, cj);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'QUOTA_EXCEEDED',
      quota: 'maxUtilisateurs',
      limit: 1,
      used: 1,
    });

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: retire.id } });
    expect(apres.deletedAt).not.toBeNull();
  });

  it('renvoie 404 pour un gestionnaire d un autre cabinet ou non archive (isolation)', async () => {
    const { cj: cabinetA } = await creerCabinetRH('rest-iso-a');
    const { cj: cabinetB, user: titulaireB } = await creerCabinetRH('rest-iso-b');
    const { user: cibleB } = await creerGestionnaire(titulaireB.cabinetId!, 'rest-iso-cible');

    // Non archive : rien a restaurer.
    expect((await put(cibleB.id, cabinetB)).status).toBe(404);

    await del(cibleB.id, cabinetB);
    const autreCabinet = await put(cibleB.id, cabinetA);
    expect(autreCabinet.status).toBe(404);

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: cibleB.id } });
    expect(apres.deletedAt).not.toBeNull();
  });
});
