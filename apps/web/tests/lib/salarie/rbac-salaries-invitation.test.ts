// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cookieJar, testEmail, TEST_EMAIL_PREFIX } from '../../helpers/auth-test-utils';

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
  sendCollaborateurInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeAccountEmail: vi.fn().mockResolvedValue(undefined),
  sendAdminReplacedEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const { supprimerCabinetsEtDonnees } = await import('@/lib/cabinet/cabinet-purge');
const { resolveScope } = await import('@/lib/authz/authz');
const email = await import('@/lib/email/email');
const { lookupHash } = await import('@/lib/crypto/field-encryption');
const { POST: inviter, DELETE: revoquer } =
  await import('@/app/api/salaries/[id]/invitation/route');
const { DELETE: revoquerGenerique } = await import('@/app/api/invitations/[id]/route');
const { POST: renvoyerGenerique } = await import('@/app/api/invitations/[id]/resend/route');
const { GET: exporter } = await import('@/app/api/cabinet/export/route');
const { acceptInvitationWithPassword } = await import('@/lib/invitations/invitation-accept');
const { getInvitationPreview } = await import('@/lib/invitations/invitation-preview');
const { getSalarieDetail } = await import('@/lib/salarie/salarie-data');
const { getCabinetAuditLog } = await import('@/lib/cabinet/cabinet-audit');
const { getInvitations } = await import('@/lib/cabinet/cabinet-data');

const envoyer = vi.mocked(email.sendCollaborateurInvitationEmail);

beforeEach(() => {
  envoyer.mockReset().mockResolvedValue(undefined);
});

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  // Les salariés et leurs invitations sont supprimés avec le cabinet par supprimerCabinetsEtDonnees (D94 : Restrict).
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await supprimerCabinetsEtDonnees(cabinetIds);
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.verification.deleteMany({
    where: {
      OR: [
        { identifier: { contains: TEST_EMAIL_PREFIX } },
        { value: { contains: TEST_EMAIL_PREFIX } },
      ],
    },
  });
});

type Jar = ReturnType<typeof cookieJar>;

async function creerCompte(label: string) {
  const mail = testEmail(label);
  const cj = cookieJar();
  cj.apply(
    await auth.api.signUpEmail({
      body: { name: label, email: mail, password: 'InitialPass123!' },
      asResponse: true,
    }),
  );
  return { cj, user: await prisma.user.findUniqueOrThrow({ where: { email: mail } }) };
}

// L'inscription crée un Cabinet RH et son cabinet ; les autres rôles reprennent
// le cabinet voulu et l'on supprime celui créé à l'inscription.
async function creerAvecRole(label: string, role: string, cabinetId: string) {
  const { cj, user } = await creerCompte(label);
  await prisma.user.update({ where: { id: user.id }, data: { role, cabinetId } });
  await supprimerCabinetsEtDonnees([user.cabinetId!]);
  return { cj, user: await prisma.user.findUniqueOrThrow({ where: { id: user.id } }) };
}

let vat = 98_000_000;
const creerEntreprise = (cabinetId: string, extra: { deletedAt?: Date } = {}) =>
  prisma.entreprise.create({
    data: { cabinetId, name: 'Boulangerie de test', vatNumber: `BE0${++vat}`, ...extra },
  });

let compteur = 0;
// Un dossier posé en base, avec l'adresse voulue (préfixe de test : nettoyée en fin de passe).
function creerDossier(
  cabinetId: string,
  entrepriseId: string,
  extra: { email?: string | null; userId?: string; deletedAt?: Date; prenom?: string } = {},
) {
  compteur += 1;
  return prisma.salarie.create({
    data: {
      cabinetId,
      entrepriseId,
      nom: 'Dupont',
      prenom: extra.prenom ?? 'Camille',
      dateNaissance: new Date('1990-01-01'),
      email: extra.email === undefined ? testEmail(`salarie-${compteur}`) : extra.email,
      nissEncrypted: 'v1:a:b:c',
      nissHash: lookupHash(entrepriseId, `niss-${compteur}-${Date.now()}`),
      ibanEncrypted: 'v1:a:b:c',
      typeContrat: 'CDI',
      dateEntree: new Date('2024-01-01'),
      situationFamiliale: 'ISOLE',
      userId: extra.userId,
      deletedAt: extra.deletedAt,
    },
  });
}

const entetes = (cj?: Jar) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return headers;
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const url = (id: string) => `http://localhost:3000/api/salaries/${id}/invitation`;
const inviterSalarie = (id: string, cj?: Jar) =>
  inviter(new Request(url(id), { method: 'POST', headers: entetes(cj) }), ctx(id));
const revoquerInvitation = (id: string, cj?: Jar) =>
  revoquer(new Request(url(id), { method: 'DELETE', headers: entetes(cj) }), ctx(id));

// Le jeton envoyé par email : seul endroit où il existe en clair (la base n'a que son empreinte).
const jetonEnvoye = (appel = -1) => {
  const lien = envoyer.mock.calls.at(appel)?.[4] as string;
  return new URL(lien).searchParams.get('token') as string;
};

// Un cabinet, un gestionnaire assigné à une entreprise, un dossier avec son adresse.
async function mise(label: string, dossier: Parameters<typeof creerDossier>[2] = {}) {
  const { user: titulaire, cj: cjTitulaire } = await creerCompte(`${label}-t`);
  const cabinetId = titulaire.cabinetId!;
  const gestionnaire = await creerAvecRole(`${label}-g`, 'GESTIONNAIRE_RH', cabinetId);
  const entreprise = await creerEntreprise(cabinetId);
  await prisma.gestionnaireEntreprise.create({
    data: { entrepriseId: entreprise.id, userId: gestionnaire.user.id },
  });
  const salarie = await creerDossier(cabinetId, entreprise.id, dossier);
  return { cabinetId, titulaire, cjTitulaire, gestionnaire, entreprise, salarie };
}

const audits = (cabinetId: string, action: string) =>
  prisma.auditLog.findMany({ where: { cabinetId, action } });
const MOT_DE_PASSE = 'MotDePasse-Solide-123!';

describe('POST /api/salaries/[id]/invitation : invitation', () => {
  it('crée l’invitation à l’adresse du dossier, envoie l’email et journalise sans l’adresse', async () => {
    const { cabinetId, gestionnaire, entreprise, salarie } = await mise('inv-cree');

    const res = await inviterSalarie(salarie.id, gestionnaire.cj);
    expect(res.status).toBe(201);
    const corps = await res.json();
    expect(corps).toMatchObject({ success: true, resent: false, emailSent: true });

    const invitation = await prisma.invitation.findUniqueOrThrow({
      where: { id: corps.invitationId },
    });
    expect(invitation).toMatchObject({
      role: 'COLLABORATEUR',
      cabinetId,
      salarieId: salarie.id,
      entrepriseId: null,
      status: 'pending',
      invitedById: gestionnaire.user.id,
      email: salarie.email!.toLowerCase(),
    });
    expect(invitation.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);

    // Un seul envoi, avec l'adresse, le prénom et l'entreprise ; le jeton n'est pas en base.
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(envoyer.mock.calls[0][0]).toBe(salarie.email!.toLowerCase());
    expect(envoyer.mock.calls[0].slice(2, 4)).toEqual(['Camille', entreprise.name]);
    expect(invitation.tokenHash).not.toContain(jetonEnvoye());

    // D8, D26 : identifiants seulement, ni adresse ni prénom.
    const [audit] = await audits(cabinetId, 'SALARIE_PORTAL_INVITED');
    expect(audit.actorId).toBe(gestionnaire.user.id);
    expect(audit.metadata).toEqual({
      salarieId: salarie.id,
      entrepriseId: entreprise.id,
      invitationId: invitation.id,
    });
    for (const secret of [salarie.email!, 'Camille', 'Dupont']) {
      expect(JSON.stringify(audit)).not.toContain(secret);
    }
  });

  it('envoie le modèle personnalisé du cabinet quand il existe', async () => {
    const { cabinetId, gestionnaire, titulaire, salarie } = await mise('inv-modele');
    await prisma.emailTemplate.create({
      data: {
        cabinetId,
        type: 'INVITATION_COLLABORATEUR',
        subject: 'Bienvenue {{prenom}}',
        body: 'Votre espace chez {{entreprise_nom}}',
        updatedById: titulaire.id,
      },
    });

    await inviterSalarie(salarie.id, gestionnaire.cj);

    expect(envoyer.mock.calls[0][5]).toEqual({
      subject: 'Bienvenue {{prenom}}',
      body: 'Votre espace chez {{entreprise_nom}}',
    });
  });

  it('renvoyer remplace l’invitation en attente : l’ancien lien meurt, le nouveau fonctionne', async () => {
    const { cabinetId, gestionnaire, salarie } = await mise('inv-renvoi');
    const premiere = await (await inviterSalarie(salarie.id, gestionnaire.cj)).json();
    const ancienJeton = jetonEnvoye();

    const seconde = await inviterSalarie(salarie.id, gestionnaire.cj);
    expect(seconde.status).toBe(201);
    const corps = await seconde.json();
    expect(corps.resent).toBe(true);
    const nouveauJeton = jetonEnvoye();
    expect(nouveauJeton).not.toBe(ancienJeton);

    expect(
      (await prisma.invitation.findUniqueOrThrow({ where: { id: premiere.invitationId } })).status,
    ).toBe('revoked');
    expect(
      await prisma.invitation.count({ where: { salarieId: salarie.id, status: 'pending' } }),
    ).toBe(1);
    expect(await audits(cabinetId, 'SALARIE_PORTAL_INVITATION_RESENT')).toHaveLength(1);

    const ancien = await acceptInvitationWithPassword({
      token: ancienJeton,
      name: 'Camille Dupont',
      password: MOT_DE_PASSE,
    });
    expect(ancien).toEqual({ ok: false, error: 'INVALID_TOKEN' });
    const nouveau = await acceptInvitationWithPassword({
      token: nouveauJeton,
      name: 'Camille Dupont',
      password: MOT_DE_PASSE,
    });
    expect(nouveau.ok).toBe(true);
  });

  it('renvoyer écrit à l’adresse ACTUELLE du dossier, si elle a changé', async () => {
    const { gestionnaire, salarie } = await mise('inv-adresse');
    await inviterSalarie(salarie.id, gestionnaire.cj);
    const nouvelle = testEmail('inv-adresse-nouvelle');
    await prisma.salarie.update({ where: { id: salarie.id }, data: { email: nouvelle } });

    await inviterSalarie(salarie.id, gestionnaire.cj);

    expect(envoyer.mock.calls.at(-1)?.[0]).toBe(nouvelle.toLowerCase());
    const pending = await prisma.invitation.findFirstOrThrow({
      where: { salarieId: salarie.id, status: 'pending' },
    });
    expect(pending.email).toBe(nouvelle.toLowerCase());
  });

  it('un échec d’envoi ne fait pas échouer l’invitation : elle existe et se renvoie', async () => {
    const { gestionnaire, salarie } = await mise('inv-echec');
    envoyer.mockRejectedValueOnce(new Error('Resend indisponible pour ' + salarie.email));
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await inviterSalarie(salarie.id, gestionnaire.cj);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ success: true, emailSent: false });
    expect(
      await prisma.invitation.count({ where: { salarieId: salarie.id, status: 'pending' } }),
    ).toBe(1);

    // L'adresse d'un salarié ne doit apparaître dans aucun log.
    expect(JSON.stringify(erreurs.mock.calls)).not.toContain(salarie.email!);
    erreurs.mockRestore();
  });

  it('refuse un dossier sans adresse, déjà pourvu d’un compte, ou dont l’adresse a déjà un compte', async () => {
    const { cabinetId, gestionnaire, entreprise, salarie } = await mise('inv-refus', {
      email: null,
    });
    const sansAdresse = await inviterSalarie(salarie.id, gestionnaire.cj);
    expect(sansAdresse.status).toBe(409);
    expect(await sansAdresse.json()).toEqual({ error: 'SALARIE_HAS_NO_EMAIL' });

    const titulaireDuCompte = await creerAvecRole('inv-refus-compte', 'COLLABORATEUR', cabinetId);
    const lie = await creerDossier(cabinetId, entreprise.id, { userId: titulaireDuCompte.user.id });
    const dejaUnCompte = await inviterSalarie(lie.id, gestionnaire.cj);
    expect(dejaUnCompte.status).toBe(409);
    expect(await dejaUnCompte.json()).toEqual({ error: 'SALARIE_ALREADY_HAS_ACCOUNT' });

    // D7 : un email = un seul rattachement.
    const pris = await creerDossier(cabinetId, entreprise.id, {
      email: titulaireDuCompte.user.email,
    });
    const adresseUtilisee = await inviterSalarie(pris.id, gestionnaire.cj);
    expect(adresseUtilisee.status).toBe(409);
    expect(await adresseUtilisee.json()).toEqual({ error: 'EMAIL_ALREADY_USED' });

    expect(envoyer).not.toHaveBeenCalled();
    expect(await prisma.invitation.count({ where: { cabinetId } })).toBe(0);
  });

  it('refuse quand une autre invitation est en attente pour la même adresse', async () => {
    const { cabinetId, titulaire, gestionnaire, salarie } = await mise('inv-conflit');
    await prisma.invitation.create({
      data: {
        email: salarie.email!.toLowerCase(),
        role: 'GESTIONNAIRE_RH',
        tokenHash: `h-conflit-${Date.now()}`,
        cabinetId,
        invitedById: titulaire.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const res = await inviterSalarie(salarie.id, gestionnaire.cj);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'INVITATION_ALREADY_PENDING' });
  });
});

describe('DELETE /api/salaries/[id]/invitation : révocation', () => {
  it('révoque l’invitation en attente et rend son lien inutilisable', async () => {
    const { cabinetId, gestionnaire, entreprise, salarie } = await mise('inv-revoque');
    const { invitationId } = await (await inviterSalarie(salarie.id, gestionnaire.cj)).json();
    const jeton = jetonEnvoye();

    const res = await revoquerInvitation(salarie.id, gestionnaire.cj);
    expect(res.status).toBe(200);
    expect(
      (await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } })).status,
    ).toBe('revoked');
    const [audit] = await audits(cabinetId, 'SALARIE_PORTAL_INVITATION_REVOKED');
    expect(audit.metadata).toEqual({
      salarieId: salarie.id,
      entrepriseId: entreprise.id,
      invitationId,
    });
    expect(await getInvitationPreview(jeton)).toBeNull();
    expect(
      await acceptInvitationWithPassword({ token: jeton, name: 'Camille', password: MOT_DE_PASSE }),
    ).toEqual({ ok: false, error: 'INVALID_TOKEN' });

    // Plus rien à révoquer.
    const encore = await revoquerInvitation(salarie.id, gestionnaire.cj);
    expect(encore.status).toBe(404);
    expect(await encore.json()).toEqual({ error: 'INVITATION_NOT_FOUND' });
  });
});

describe('acceptation d’une invitation de salarié', () => {
  it('crée le compte COLLABORATEUR, le lie au dossier, et journalise sans l’adresse', async () => {
    const { cabinetId, gestionnaire, entreprise, salarie } = await mise('inv-accepte');
    await inviterSalarie(salarie.id, gestionnaire.cj);
    const jeton = jetonEnvoye();

    // L'aperçu de la page publique : pour un salarié, SON entreprise, sans compte d'entreprise.
    const apercu = await getInvitationPreview(jeton);
    expect(apercu).toMatchObject({
      espace: 'SALARIE',
      entrepriseName: null,
      salarieEntrepriseName: entreprise.name,
    });

    const res = await acceptInvitationWithPassword({
      token: jeton,
      name: 'Camille Dupont',
      password: MOT_DE_PASSE,
    });
    expect(res).toMatchObject({ ok: true, entrepriseName: entreprise.name });

    const compte = await prisma.user.findUniqueOrThrow({
      where: { email: salarie.email!.toLowerCase() },
    });
    expect(compte).toMatchObject({
      role: 'COLLABORATEUR',
      cabinetId,
      emailVerified: true,
    });
    // Le compte est lié au dossier, et l'entreprise n'a pas gagné d'administrateur.
    expect((await prisma.salarie.findUniqueOrThrow({ where: { id: salarie.id } })).userId).toBe(
      compte.id,
    );
    expect(
      (await prisma.entreprise.findUniqueOrThrow({ where: { id: entreprise.id } })).adminUserId,
    ).toBeNull();

    // D26 : une action propre, identifiants seulement ; pas d'INVITATION_ACCEPTED (qui porte l'email).
    expect(await audits(cabinetId, 'INVITATION_ACCEPTED')).toHaveLength(0);
    const [audit] = await audits(cabinetId, 'SALARIE_PORTAL_ACCEPTED');
    expect(audit.actorId).toBe(compte.id);
    expect(audit.metadata).toEqual({
      salarieId: salarie.id,
      entrepriseId: entreprise.id,
      invitationId: expect.any(String),
    });
    expect(JSON.stringify(audit)).not.toContain(salarie.email!);

    // Un dossier = un compte : le lien ne sert qu'une fois, et on n'invite plus ce dossier.
    expect(
      await acceptInvitationWithPassword({ token: jeton, name: 'Autre', password: MOT_DE_PASSE }),
    ).toEqual({ ok: false, error: 'INVALID_TOKEN' });
    const reinvitation = await inviterSalarie(salarie.id, gestionnaire.cj);
    expect(reinvitation.status).toBe(409);
    expect(await reinvitation.json()).toEqual({ error: 'SALARIE_ALREADY_HAS_ACCOUNT' });
  });

  it('un dossier archivé entre-temps rend le lien invalide, à l’aperçu comme à l’acceptation', async () => {
    const { gestionnaire, salarie } = await mise('inv-archive');
    await inviterSalarie(salarie.id, gestionnaire.cj);
    const jeton = jetonEnvoye();
    await prisma.salarie.update({ where: { id: salarie.id }, data: { deletedAt: new Date() } });

    expect(await getInvitationPreview(jeton)).toBeNull();
    expect(
      await acceptInvitationWithPassword({ token: jeton, name: 'Camille', password: MOT_DE_PASSE }),
    ).toEqual({ ok: false, error: 'INVALID_TOKEN' });
    expect(await prisma.user.count({ where: { email: salarie.email!.toLowerCase() } })).toBe(0);
  });

  it('un lien expiré est invalide', async () => {
    const { gestionnaire, salarie } = await mise('inv-expire');
    await inviterSalarie(salarie.id, gestionnaire.cj);
    const jeton = jetonEnvoye();
    await prisma.invitation.updateMany({
      where: { salarieId: salarie.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await getInvitationPreview(jeton)).toBeNull();
    expect(
      await acceptInvitationWithPassword({ token: jeton, name: 'Camille', password: MOT_DE_PASSE }),
    ).toEqual({ ok: false, error: 'INVALID_TOKEN' });
  });
});

describe('état du portail sur la fiche', () => {
  it('suit le cycle : aucune, en attente, expirée, compte actif — sans exposer l’adresse', async () => {
    const { gestionnaire, salarie } = await mise('inv-etat');
    const scope = (await resolveScope(gestionnaire.user))!;
    const etat = async () => (await getSalarieDetail(scope, salarie.id))!.portail;

    expect(await etat()).toEqual({ etat: 'AUCUNE' });

    await inviterSalarie(salarie.id, gestionnaire.cj);
    expect((await etat()).etat).toBe('EN_ATTENTE');
    const detail = await getSalarieDetail(scope, salarie.id);
    expect(JSON.stringify(detail)).not.toContain('tokenHash');

    await prisma.invitation.updateMany({
      where: { salarieId: salarie.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await etat()).etat).toBe('EXPIREE');

    await inviterSalarie(salarie.id, gestionnaire.cj);
    await acceptInvitationWithPassword({
      token: jetonEnvoye(),
      name: 'Camille',
      password: MOT_DE_PASSE,
    });
    expect(await etat()).toEqual({ etat: 'COMPTE_ACTIF' });
  });
});

describe('invitation d’un salarié : le Cabinet RH ne voit rien (D26)', () => {
  it('ni l’adresse dans l’export, ni l’invitation dans les listes, ni une action dans son journal', async () => {
    const { cabinetId, cjTitulaire, gestionnaire, salarie } = await mise('inv-d26');
    const { invitationId } = await (await inviterSalarie(salarie.id, gestionnaire.cj)).json();
    await acceptInvitationWithPassword({
      token: jetonEnvoye(),
      name: 'Camille',
      password: MOT_DE_PASSE,
    });
    // Une seconde invitation, en attente : elle ne doit pas non plus apparaître.
    const autre = await creerDossier(cabinetId, salarie.entrepriseId);
    await inviterSalarie(autre.id, gestionnaire.cj);

    // Export du cabinet (D74).
    const exportRes = await exporter(
      new Request('http://localhost:3000/api/cabinet/export', { headers: entetes(cjTitulaire) }),
    );
    expect(exportRes.status).toBe(200);
    const brut = await exportRes.text();
    for (const secret of [salarie.email!, autre.email!, 'COLLABORATEUR']) {
      expect(brut).not.toContain(secret);
    }

    // Liste des invitations de l'équipe, et quotas : seuls les gestionnaires y comptent (D56).
    expect(await getInvitations(cabinetId)).toEqual([]);

    // Journal d'audit du cabinet (D31) : aucune action de ces invitations.
    const journal = await getCabinetAuditLog(cabinetId, {}, 1);
    const texte = JSON.stringify(journal);
    for (const secret of [salarie.email!, autre.email!, 'SALARIE_PORTAL']) {
      expect(texte).not.toContain(secret);
    }

    // Les routes génériques d'invitation (Cabinet RH) ne voient pas ces invitations : 404.
    const pending = await prisma.invitation.findFirstOrThrow({
      where: { salarieId: autre.id, status: 'pending' },
    });
    for (const id of [invitationId, pending.id]) {
      const revoque = await revoquerGenerique(
        new Request(`http://localhost:3000/api/invitations/${id}`, {
          method: 'DELETE',
          headers: entetes(cjTitulaire),
        }),
        ctx(id),
      );
      const renvoye = await renvoyerGenerique(
        new Request(`http://localhost:3000/api/invitations/${id}/resend`, {
          method: 'POST',
          headers: entetes(cjTitulaire),
        }),
        ctx(id),
      );
      expect(revoque.status).toBe(404);
      expect(renvoye.status).toBe(404);
    }
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe(
      'pending',
    );
  });
});

describe('invitation d’un salarié : isolation et autorisations', () => {
  it('404 sans rien créer ni envoyer pour un dossier non assigné, d’un autre cabinet, archivé ou inconnu', async () => {
    const { cabinetId, gestionnaire, salarie } = await mise('inv-404');
    const { user: autreTitulaire } = await creerCompte('inv-404-autre');
    const nonAssignee = await creerEntreprise(cabinetId);
    const entrepriseArchivee = await creerEntreprise(cabinetId, { deletedAt: new Date() });
    const autreCabinet = await creerEntreprise(autreTitulaire.cabinetId!);
    // Même une assignation posée par erreur ne donne accès ni à un autre cabinet ni à une archivée.
    await prisma.gestionnaireEntreprise.createMany({
      data: [entrepriseArchivee, autreCabinet].map((e) => ({
        entrepriseId: e.id,
        userId: gestionnaire.user.id,
      })),
    });
    const archive = await creerDossier(cabinetId, salarie.entrepriseId, {
      deletedAt: new Date(),
    });
    const ids = [
      (await creerDossier(cabinetId, nonAssignee.id)).id,
      (await creerDossier(cabinetId, entrepriseArchivee.id)).id,
      (await creerDossier(autreTitulaire.cabinetId!, autreCabinet.id)).id,
      archive.id,
      'id-inconnu',
    ];

    for (const id of ids) {
      for (const res of [
        await inviterSalarie(id, gestionnaire.cj),
        await revoquerInvitation(id, gestionnaire.cj),
      ]) {
        expect(res.status, id).toBe(404);
        expect(await res.json()).toEqual({ error: 'SALARIE_NOT_FOUND' });
      }
    }
    expect(envoyer).not.toHaveBeenCalled();
    expect(
      await prisma.invitation.count({ where: { salarieId: { in: ids }, role: 'COLLABORATEUR' } }),
    ).toBe(0);
  });

  it('une assignation retirée coupe l’invitation dès la requête suivante', async () => {
    const { gestionnaire, salarie } = await mise('inv-retrait');
    expect((await inviterSalarie(salarie.id, gestionnaire.cj)).status).toBe(201);

    await prisma.gestionnaireEntreprise.deleteMany({ where: { userId: gestionnaire.user.id } });

    expect((await inviterSalarie(salarie.id, gestionnaire.cj)).status).toBe(404);
    expect((await revoquerInvitation(salarie.id, gestionnaire.cj)).status).toBe(404);
  });

  it('401 sans session', async () => {
    const { salarie } = await mise('inv-401');
    expect((await inviterSalarie(salarie.id)).status).toBe(401);
    expect((await revoquerInvitation(salarie.id)).status).toBe(401);
  });

  it('403 pour le Cabinet RH, l’entreprise et le collaborateur : seul le gestionnaire invite', async () => {
    const { cabinetId, cjTitulaire, salarie } = await mise('inv-403');
    const adminEntreprise = await creerAvecRole('inv-403-ent', 'ENTREPRISE_CLIENTE', cabinetId);
    const collaborateur = await creerAvecRole('inv-403-col', 'COLLABORATEUR', cabinetId);

    for (const cj of [cjTitulaire, adminEntreprise.cj, collaborateur.cj]) {
      for (const res of [
        await inviterSalarie(salarie.id, cj),
        await revoquerInvitation(salarie.id, cj),
      ]) {
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'FORBIDDEN' });
      }
    }
    expect(envoyer).not.toHaveBeenCalled();
    expect(await prisma.invitation.count({ where: { salarieId: salarie.id } })).toBe(0);
  });

  it('423 quand le cabinet est en lecture seule, sans rien créer ni envoyer (D29)', async () => {
    const { cabinetId, gestionnaire, salarie } = await mise('inv-423');
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus: 'RESILIE' } });

    for (const res of [
      await inviterSalarie(salarie.id, gestionnaire.cj),
      await revoquerInvitation(salarie.id, gestionnaire.cj),
    ]) {
      expect(res.status).toBe(423);
      expect(await res.json()).toEqual({ error: 'CABINET_READ_ONLY' });
    }
    expect(envoyer).not.toHaveBeenCalled();
    expect(await prisma.invitation.count({ where: { salarieId: salarie.id } })).toBe(0);
  });
});
