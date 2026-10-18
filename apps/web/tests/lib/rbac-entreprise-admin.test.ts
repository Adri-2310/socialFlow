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
  sendEntrepriseInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeAccountEmail: vi.fn().mockResolvedValue(undefined),
  sendGestionnaireAccessChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const email = await import('@/lib/email');
const { POST: inviteRoute } = await import('@/app/api/cabinet/entreprises/[id]/admin-invitation/route');
const { POST: createEntreprise } = await import('@/app/api/cabinet/entreprises/route');
const { DELETE: removeAdminRoute } = await import('@/app/api/cabinet/entreprises/[id]/admin/route');
const { POST: acceptInvitation } = await import('@/app/api/invitations/accept/route');
const { POST: resendInvitation } = await import('@/app/api/invitations/[id]/resend/route');
const { DELETE: revokeInvitation } = await import('@/app/api/invitations/[id]/route');
const { getEntreprises } = await import('@/lib/cabinet-entreprises');
const { getInvitations, getCabinetOverview } = await import('@/lib/cabinet-data');
const { getCabinetQuotaUsage } = await import('@/lib/cabinet-quotas');
const { getInvitationPreview } = await import('@/lib/invitation-preview');
const { hashInvitationToken } = await import('@/lib/invitations');

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
  await prisma.invitation.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: { OR: [{ identifier: { contains: TEST_EMAIL_PREFIX } }, { value: { contains: TEST_EMAIL_PREFIX } }] },
  });
});

type Jar = ReturnType<typeof cookieJar>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function creerCabinetRH(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: 'Cabinet Admin Test', email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  return { cj, user };
}

async function creerGestionnaire(cabinetId: string, label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: `Gestionnaire ${label}`, email: mail, password: PASSWORD },
      asResponse: true,
    }),
  );
  const created = await prisma.user.findUniqueOrThrow({ where: { email: mail } });
  await prisma.user.update({ where: { id: created.id }, data: { role: 'GESTIONNAIRE_RH', cabinetId } });
  await prisma.cabinet.delete({ where: { id: created.cabinetId! } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
  return { cj, user };
}

let vatCounter = 20_000_000;
async function creerEntreprise(cabinetId: string, name = 'Boulangerie Dupont') {
  vatCounter += 1;
  return prisma.entreprise.create({
    data: { cabinetId, name, vatNumber: `BE0${vatCounter}` },
  });
}

function json(method: string, url: string, cj?: Jar, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const inviter = (entrepriseId: string, address: unknown, cj?: Jar) =>
  inviteRoute(
    json('POST', `${APP_URL}/api/cabinet/entreprises/${entrepriseId}/admin-invitation`, cj, { email: address }),
    ctx(entrepriseId),
  );
const renvoyer = (id: string, cj?: Jar) =>
  resendInvitation(json('POST', `${APP_URL}/api/invitations/${id}/resend`, cj), ctx(id));
const revoquer = (id: string, cj?: Jar) =>
  revokeInvitation(json('DELETE', `${APP_URL}/api/invitations/${id}`, cj), ctx(id));
const accepter = (token: string, name = 'Admin Entreprise') =>
  acceptInvitation(json('POST', `${APP_URL}/api/invitations/accept`, undefined, { token, name, password: PASSWORD }));

/** Jeton en clair du dernier email d'invitation d'entreprise envoye a cette adresse. */
function dernierJeton(address: string): string {
  const calls = vi.mocked(email.sendEntrepriseInvitationEmail).mock.calls;
  const call = [...calls].reverse().find(([to]) => to === address);
  if (!call) throw new Error(`Aucun email d'invitation envoye a ${address}`);
  return new URL(call[4]).searchParams.get('token') as string;
}

describe('invitation de l administrateur d une entreprise (D4, D5)', () => {
  it('refuse sans session et a un role autre que Cabinet RH', async () => {
    const { user: titulaire } = await creerCabinetRH('adm-roles');
    const entreprise = await creerEntreprise(titulaire.cabinetId!);
    const { cj: gestionnaire } = await creerGestionnaire(titulaire.cabinetId!, 'adm-roles-g');

    expect((await inviter(entreprise.id, testEmail('adm-cible'))).status).toBe(401);
    expect((await inviter(entreprise.id, testEmail('adm-cible'), gestionnaire)).status).toBe(403);
  });

  it('cree l invitation liee a l entreprise, envoie l email et journalise', async () => {
    const { cj, user } = await creerCabinetRH('adm-ok');
    const entreprise = await creerEntreprise(user.cabinetId!);
    const cible = testEmail('adm-ok-cible');

    const res = await inviter(entreprise.id, cible.toUpperCase(), cj);
    expect(res.status).toBe(201);

    const invitation = await prisma.invitation.findFirstOrThrow({ where: { email: cible } });
    expect(invitation.role).toBe('ENTREPRISE_CLIENTE');
    expect(invitation.entrepriseId).toBe(entreprise.id);
    expect(invitation.cabinetId).toBe(user.cabinetId);
    expect(invitation.status).toBe('pending');
    // C3 : seul le hash du jeton est stocke.
    expect(invitation.tokenHash).toBe(hashInvitationToken(dernierJeton(cible)));

    expect(email.sendEntrepriseInvitationEmail).toHaveBeenCalledWith(
      cible,
      expect.objectContaining({ name: expect.any(String) }),
      'Cabinet Admin Test',
      'Boulangerie Dupont',
      expect.stringContaining('/invitations/accept?token='),
      null,
      { portalUrl: expect.stringContaining('/connexion/') },
    );

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId: user.cabinetId!, action: 'INVITATION_SENT' },
    });
    expect(audit.metadata).toMatchObject({
      role: 'ENTREPRISE_CLIENTE',
      entrepriseId: entreprise.id,
      entreprise: 'Boulangerie Dupont',
    });
  });

  it('refuse une adresse invalide', async () => {
    const { cj, user } = await creerCabinetRH('adm-invalide');
    const entreprise = await creerEntreprise(user.cabinetId!);
    expect((await inviter(entreprise.id, 'pas-un-email', cj)).status).toBe(400);
    expect((await inviter(entreprise.id, 42, cj)).status).toBe(400);
  });

  it('ne trouve pas une entreprise d un autre cabinet ni une entreprise archivee (404)', async () => {
    const { cj } = await creerCabinetRH('adm-iso-a');
    const { user: autre } = await creerCabinetRH('adm-iso-b');
    const etrangere = await creerEntreprise(autre.cabinetId!);

    const res = await inviter(etrangere.id, testEmail('adm-iso-cible'), cj);
    expect(res.status).toBe(404);
    expect(await prisma.invitation.count({ where: { entrepriseId: etrangere.id } })).toBe(0);

    const { cj: cj2, user: u2 } = await creerCabinetRH('adm-archivee');
    const archivee = await creerEntreprise(u2.cabinetId!);
    await prisma.entreprise.update({ where: { id: archivee.id }, data: { deletedAt: new Date() } });
    expect((await inviter(archivee.id, testEmail('adm-arch-cible'), cj2)).status).toBe(404);
  });

  it('refuse une seconde invitation tant qu une est en attente, et un email deja inscrit (D7)', async () => {
    const { cj, user } = await creerCabinetRH('adm-doublon');
    const entreprise = await creerEntreprise(user.cabinetId!);

    expect((await inviter(entreprise.id, testEmail('adm-d1'), cj)).status).toBe(201);
    const second = await inviter(entreprise.id, testEmail('adm-d2'), cj);
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe('INVITATION_ALREADY_PENDING');

    const autre = await creerEntreprise(user.cabinetId!, 'Garage Pirard');
    const deja = await inviter(autre.id, user.email, cj);
    expect(deja.status).toBe(409);
    expect((await deja.json()).error).toBe('EMAIL_ALREADY_USED');
  });

  it('ne compte ni dans les quotas ni dans l equipe de gestionnaires', async () => {
    const { cj, user } = await creerCabinetRH('adm-quota');
    const entreprise = await creerEntreprise(user.cabinetId!);
    const avant = await getCabinetQuotaUsage(user.cabinetId!);

    await inviter(entreprise.id, testEmail('adm-quota-cible'), cj);

    const apres = await getCabinetQuotaUsage(user.cabinetId!);
    expect(apres.utilisateurs.used).toBe(avant.utilisateurs.used);
    expect((await getInvitations(user.cabinetId!)).length).toBe(0);
    expect((await getCabinetOverview(user.cabinetId!)).pendingInvitations).toBe(0);
  });

  it('apparait dans le portefeuille avec son statut', async () => {
    const { cj, user } = await creerCabinetRH('adm-liste');
    const entreprise = await creerEntreprise(user.cabinetId!);
    const cible = testEmail('adm-liste-cible');

    expect((await getEntreprises(user.cabinetId!))[0]).toMatchObject({ admin: null, adminInvitation: null });
    await inviter(entreprise.id, cible, cj);

    const [ligne] = await getEntreprises(user.cabinetId!);
    expect(ligne.admin).toBeNull();
    expect(ligne.adminInvitation).toMatchObject({ email: cible, status: 'pending' });
    // Le hash du jeton ne sort jamais de la couche de lecture (C3).
    expect(JSON.stringify(ligne)).not.toContain('tokenHash');
  });
});

describe('renvoi et revocation', () => {
  it('renvoie avec un nouveau jeton : l ancien lien cesse de fonctionner', async () => {
    const { cj, user } = await creerCabinetRH('adm-renvoi');
    const entreprise = await creerEntreprise(user.cabinetId!);
    const cible = testEmail('adm-renvoi-cible');
    await inviter(entreprise.id, cible, cj);
    const ancien = dernierJeton(cible);
    const invitation = await prisma.invitation.findFirstOrThrow({ where: { email: cible } });

    const res = await renvoyer(invitation.id, cj);
    expect(res.status).toBe(200);

    const nouveau = dernierJeton(cible);
    expect(nouveau).not.toBe(ancien);
    expect((await accepter(ancien)).status).toBe(404);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId: user.cabinetId!, action: 'INVITATION_RESENT' },
    });
    expect(audit.metadata).toMatchObject({ entreprise: 'Boulangerie Dupont' });
  });

  it('revoque : le lien ne fonctionne plus et une nouvelle invitation devient possible', async () => {
    const { cj, user } = await creerCabinetRH('adm-revoque');
    const entreprise = await creerEntreprise(user.cabinetId!);
    const cible = testEmail('adm-revoque-cible');
    await inviter(entreprise.id, cible, cj);
    const jeton = dernierJeton(cible);
    const invitation = await prisma.invitation.findFirstOrThrow({ where: { email: cible } });

    expect((await revoquer(invitation.id, cj)).status).toBe(200);
    expect(await getInvitationPreview(jeton)).toBeNull();
    expect((await accepter(jeton)).status).toBe(404);
    expect((await getEntreprises(user.cabinetId!))[0].adminInvitation).toBeNull();

    expect((await inviter(entreprise.id, testEmail('adm-revoque-autre'), cj)).status).toBe(201);
  });

  it('ne renvoie ni ne revoque l invitation d un autre cabinet (404)', async () => {
    const { cj: etranger } = await creerCabinetRH('adm-iso-inv-etranger');
    const titulaire = await creerCabinetRH('adm-iso-inv-titulaire');
    const entreprise = await creerEntreprise(titulaire.user.cabinetId!);
    const cible = testEmail('adm-iso-inv-cible');
    await inviter(entreprise.id, cible, titulaire.cj);
    const invitation = await prisma.invitation.findFirstOrThrow({ where: { email: cible } });

    expect((await renvoyer(invitation.id, etranger)).status).toBe(404);
    expect((await revoquer(invitation.id, etranger)).status).toBe(404);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).status).toBe('pending');
  });
});

describe('acceptation par l administrateur (D5)', () => {
  it('cree le compte ENTREPRISE_CLIENTE rattache a l entreprise et au cabinet', async () => {
    const { cj, user } = await creerCabinetRH('adm-accept');
    const entreprise = await creerEntreprise(user.cabinetId!);
    const cible = testEmail('adm-accept-cible');
    await inviter(entreprise.id, cible, cj);
    const jeton = dernierJeton(cible);

    const apercu = await getInvitationPreview(jeton);
    expect(apercu).toMatchObject({ email: cible, entrepriseName: 'Boulangerie Dupont' });

    const res = await accepter(jeton);
    expect(res.status).toBe(200);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: cible } });
    expect(admin.role).toBe('ENTREPRISE_CLIENTE');
    expect(admin.cabinetId).toBe(user.cabinetId);
    const lue = await prisma.entreprise.findUniqueOrThrow({ where: { id: entreprise.id } });
    expect(lue.adminUserId).toBe(admin.id);
    expect(
      (await prisma.invitation.findFirstOrThrow({ where: { email: cible } })).status,
    ).toBe('accepted');

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId: user.cabinetId!, action: 'INVITATION_ACCEPTED' },
    });
    expect(audit.metadata).toMatchObject({ entrepriseId: entreprise.id, entreprise: 'Boulangerie Dupont' });

    const [ligne] = await getEntreprises(user.cabinetId!);
    expect(ligne.admin).toMatchObject({ email: cible });
    expect(ligne.adminInvitation).toBeNull();
    // Le cabinet "fantome" cree par l'inscription a bien disparu.
    expect(await prisma.cabinet.count({ where: { id: admin.cabinetId! } })).toBe(1);
  });

  it('n envoie pas d email de verification a la personne invitee (adresse deja prouvee, D72)', async () => {
    const { cj, user } = await creerCabinetRH('adm-verif');
    const entreprise = await creerEntreprise(user.cabinetId!);
    const cible = testEmail('adm-verif-cible');
    await inviter(entreprise.id, cible, cj);
    await accepter(dernierJeton(cible));

    // Controle positif : l'auto-inscription du titulaire, elle, declenche bien
    // l'email de verification (envoye en tache de fond).
    await vi.waitFor(() =>
      expect(email.sendVerificationEmail).toHaveBeenCalledWith(user.email, expect.any(String)),
    );
    expect(email.sendVerificationEmail).not.toHaveBeenCalledWith(cible, expect.anything());
    expect((await prisma.user.findUniqueOrThrow({ where: { email: cible } })).emailVerified).toBe(true);
  });

  it('un seul administrateur : plus d invitation ni de renvoi une fois l entreprise pourvue', async () => {
    const { cj, user } = await creerCabinetRH('adm-unique');
    const entreprise = await creerEntreprise(user.cabinetId!);
    const cible = testEmail('adm-unique-cible');
    await inviter(entreprise.id, cible, cj);
    await accepter(dernierJeton(cible));

    const res = await inviter(entreprise.id, testEmail('adm-unique-autre'), cj);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ENTREPRISE_ALREADY_HAS_ADMIN');
  });

  it('refuse un lien dont l entreprise a ete archivee entre-temps', async () => {
    const { cj, user } = await creerCabinetRH('adm-arch-lien');
    const entreprise = await creerEntreprise(user.cabinetId!);
    const cible = testEmail('adm-arch-lien-cible');
    await inviter(entreprise.id, cible, cj);
    const jeton = dernierJeton(cible);

    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { deletedAt: new Date() } });

    expect(await getInvitationPreview(jeton)).toBeNull();
    expect((await accepter(jeton)).status).toBe(404);
    expect(await prisma.user.count({ where: { email: cible } })).toBe(0);
  });

  it('refuse le lien si un administrateur a ete pose entre-temps et ne laisse aucun compte', async () => {
    const { cj, user } = await creerCabinetRH('adm-course');
    const entreprise = await creerEntreprise(user.cabinetId!);
    const cible = testEmail('adm-course-cible');
    await inviter(entreprise.id, cible, cj);
    const jeton = dernierJeton(cible);

    const { user: occupant } = await creerGestionnaire(user.cabinetId!, 'adm-course-occ');
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { adminUserId: occupant.id } });

    expect((await accepter(jeton)).status).toBe(404);
    expect(await prisma.user.count({ where: { email: cible } })).toBe(0);
  });

  it('l administrateur n a aucun acces aux routes du Cabinet RH (403)', async () => {
    const { cj, user } = await creerCabinetRH('adm-droits');
    const entreprise = await creerEntreprise(user.cabinetId!);
    const cible = testEmail('adm-droits-cible');
    await inviter(entreprise.id, cible, cj);
    const accept = await accepter(dernierJeton(cible));
    const adminJar = cookieJar();
    adminJar.apply(accept);

    expect((await inviter(entreprise.id, testEmail('adm-droits-autre'), adminJar)).status).toBe(403);
    const creation = await createEntreprise(
      json('POST', `${APP_URL}/api/cabinet/entreprises`, adminJar, {
        name: 'Autre',
        vatNumber: 'BE0123.456.749',
        gestionnaireIds: [user.id],
      }),
    );
    expect(creation.status).toBe(403);
  });
});

describe('remplacement de l administrateur (D5)', () => {
  const retirer = (entrepriseId: string, cj?: Jar) =>
    removeAdminRoute(
      json('DELETE', `${APP_URL}/api/cabinet/entreprises/${entrepriseId}/admin`, cj),
      ctx(entrepriseId),
    );

  /** Entreprise dont l'administrateur a accepte son invitation. */
  async function entrepriseAvecAdmin(label: string) {
    const { cj, user } = await creerCabinetRH(label);
    const entreprise = await creerEntreprise(user.cabinetId!);
    const adresse = testEmail(`${label}-admin`);
    await inviter(entreprise.id, adresse, cj);
    const accept = await accepter(dernierJeton(adresse));
    const adminJar = cookieJar();
    adminJar.apply(accept);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: adresse } });
    return { cj, user, entreprise, adminJar, admin, adresse };
  }

  it('refuse sans session et a un role autre que Cabinet RH', async () => {
    const { entreprise, adminJar } = await entrepriseAvecAdmin('rem-roles');
    expect((await retirer(entreprise.id)).status).toBe(401);
    expect((await retirer(entreprise.id, adminJar)).status).toBe(403);
  });

  it('archive le compte, coupe ses sessions, libere la place et journalise', async () => {
    const { cj, user, entreprise, adminJar, admin } = await entrepriseAvecAdmin('rem-ok');

    const res = await retirer(entreprise.id, cj);
    expect(res.status).toBe(200);

    const archive = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(archive.deletedAt).not.toBeNull();
    expect(archive.deletedBy).toBe('CABINET_RH');
    expect(await prisma.session.count({ where: { userId: admin.id } })).toBe(0);
    expect((await prisma.entreprise.findUniqueOrThrow({ where: { id: entreprise.id } })).adminUserId).toBeNull();
    expect((await getEntreprises(user.cabinetId!))[0].admin).toBeNull();

    // Sa session ne donne plus acces a rien.
    expect((await inviter(entreprise.id, testEmail('rem-ok-x'), adminJar)).status).toBe(401);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { cabinetId: user.cabinetId!, action: 'USER_ARCHIVED', targetUserId: admin.id },
    });
    expect(audit.metadata).toMatchObject({ entrepriseId: entreprise.id, entreprise: 'Boulangerie Dupont' });
  });

  it('permet d inviter un remplacant, mais pas avec l adresse de l ancien (D7)', async () => {
    const { cj, entreprise, adresse } = await entrepriseAvecAdmin('rem-remplace');
    await retirer(entreprise.id, cj);

    const ancien = await inviter(entreprise.id, adresse, cj);
    expect(ancien.status).toBe(409);
    expect((await ancien.json()).error).toBe('EMAIL_ALREADY_USED');

    const nouveau = testEmail('rem-remplace-nouveau');
    expect((await inviter(entreprise.id, nouveau, cj)).status).toBe(201);
    expect((await accepter(dernierJeton(nouveau))).status).toBe(200);
    const lue = await prisma.entreprise.findUniqueOrThrow({ where: { id: entreprise.id } });
    expect(lue.adminUserId).toBe((await prisma.user.findUniqueOrThrow({ where: { email: nouveau } })).id);
  });

  it('refuse s il n y a pas d administrateur (409) et hors perimetre (404)', async () => {
    const { cj, user } = await creerCabinetRH('rem-aucun');
    const entreprise = await creerEntreprise(user.cabinetId!);
    const vide = await retirer(entreprise.id, cj);
    expect(vide.status).toBe(409);
    expect((await vide.json()).error).toBe('ENTREPRISE_HAS_NO_ADMIN');

    const { entreprise: etrangere, admin } = await entrepriseAvecAdmin('rem-etranger');
    expect((await retirer(etrangere.id, cj)).status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).deletedAt).toBeNull();
  });
});
