// @vitest-environment node
import { afterAll, describe, expect, it, vi } from 'vitest';
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
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEnabledEmail: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorDisabledEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountUnlinkedEmail: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import('@/lib/auth/auth');
const { prisma } = await import('@/lib/prisma');
const { supprimerCabinetsEtDonnees } = await import('@/lib/cabinet/cabinet-purge');
const { dechiffrerSalarie } = await import('@/lib/salarie/salarie-crypto');
const { POST } = await import('@/app/api/entreprises/[id]/salaries/route');

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  // Les salariés et leurs conditions sont supprimés avec le cabinet par supprimerCabinetsEtDonnees (D94 : Restrict).
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

let vat = 60_000_000;
const creerEntreprise = (cabinetId: string, extra: { deletedAt?: Date } = {}) =>
  prisma.entreprise.create({
    data: { cabinetId, name: 'Entreprise de test', vatNumber: `BE0${++vat}`, ...extra },
  });

// NISS valides distincts : 9 chiffres de base, clé = 97 − (base mod 97).
let compteurNiss = 0;
const nissValide = () => {
  const base = 850730000 + ++compteurNiss;
  return `${base}${String(97 - (base % 97)).padStart(2, '0')}`;
};

const salarieValide = (niss = nissValide()) => ({
  nom: 'Dupont',
  prenom: 'Marie',
  niss,
  dateNaissance: '1985-07-30',
  iban: 'BE68 5390 0754 7034',
  typeContrat: 'CDI',
  dateEntree: '2026-11-01',
  statut: 'EMPLOYE',
  commissionParitaire: '200',
  fonction: 'Comptable',
  regime: 'TEMPS_PLEIN',
  salaireMensuelBrutCents: 280000,
  situationFamiliale: 'ISOLE',
  enfantsCharge: 0,
});

function creer(entrepriseId: string, body: unknown, cj?: Jar) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return POST(
    new Request(`http://localhost:3000/api/entreprises/${entrepriseId}/salaries`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: entrepriseId }) },
  );
}

// Un cabinet, un gestionnaire assigné à une entreprise.
async function mise(label: string) {
  const { user: titulaire, cj: cjTitulaire } = await creerCompte(`${label}-t`);
  const cabinetId = titulaire.cabinetId!;
  const gestionnaire = await creerAvecRole(`${label}-g`, 'GESTIONNAIRE_RH', cabinetId);
  const entreprise = await creerEntreprise(cabinetId);
  await prisma.gestionnaireEntreprise.create({
    data: { entrepriseId: entreprise.id, userId: gestionnaire.user.id },
  });
  return { cabinetId, titulaire, cjTitulaire, gestionnaire, entreprise };
}

describe('POST /api/entreprises/[id]/salaries : création', () => {
  it('crée le dossier, sa première condition et l’audit, avec NISS et IBAN chiffrés', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('sal-creer');
    const body = salarieValide();

    const res = await creer(entreprise.id, body, gestionnaire.cj);
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const salarie = await prisma.salarie.findUniqueOrThrow({
      where: { id },
      include: { conditions: true },
    });
    expect(salarie).toMatchObject({ cabinetId, entrepriseId: entreprise.id, nom: 'Dupont' });
    // Chiffrés en base, restitués au déchiffrement.
    expect(salarie.nissEncrypted).not.toContain(body.niss);
    expect(dechiffrerSalarie(id, 'niss', salarie.nissEncrypted)).toBe(body.niss);
    expect(dechiffrerSalarie(id, 'iban', salarie.ibanEncrypted)).toBe('BE68539007547034');
    // D97 : écrits au format v2, liés à l'identifiant du dossier et au champ.
    expect(salarie.nissEncrypted.startsWith('v2:')).toBe(true);
    expect(salarie.ibanEncrypted.startsWith('v2:')).toBe(true);
    // Première ligne de l'historique daté, à la date d'entrée.
    expect(salarie.conditions).toHaveLength(1);
    expect(salarie.conditions[0]).toMatchObject({
      statut: 'EMPLOYE',
      fonction: 'Comptable',
      salaireMensuelBrutCents: 280000,
      createdById: gestionnaire.user.id,
    });
    expect(salarie.conditions[0].dateEffet.toISOString()).toBe(salarie.dateEntree.toISOString());
  });

  it('écrit l’audit avec des identifiants seulement (D8, D26)', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('sal-audit');
    const body = salarieValide();
    const { id } = await (await creer(entreprise.id, body, gestionnaire.cj)).json();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'SALARIE_CREATED', cabinetId },
    });
    expect(audit.actorId).toBe(gestionnaire.user.id);
    expect(audit.metadata).toEqual({ salarieId: id, entrepriseId: entreprise.id });
    const brut = JSON.stringify(audit);
    for (const secret of [body.niss, 'Dupont', 'Marie', '5390', '280000']) {
      expect(brut).not.toContain(secret);
    }
  });

  it('écrit la situation fiscale complète (D95) et, sans rien d’autre, les valeurs par défaut', async () => {
    const { gestionnaire, entreprise } = await mise('sal-fiscal');

    // Un célibataire sans charge ne remplit rien.
    const simple = await (await creer(entreprise.id, salarieValide(), gestionnaire.cj)).json();
    expect(await prisma.salarie.findUniqueOrThrow({ where: { id: simple.id } })).toMatchObject({
      situationFamiliale: 'ISOLE',
      conjointRevenus: null,
      beneficiaireHandicape: false,
      conjointHandicape: false,
      enfantsCharge: 0,
      enfantsHandicapes: 0,
      autresChargeDependantes66: 0,
      autresChargeHandicapees: 0,
      autresCharge: 0,
      parentIsole: false,
      chargesFamilleAttribuees: null,
    });

    // Un couple qui travaille, avec charges et attribution choisie.
    const res = await creer(
      entreprise.id,
      {
        ...salarieValide(),
        niss: nissValide(),
        situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL',
        conjointRevenus: 'PENSION_LIMITEE',
        beneficiaireHandicape: true,
        enfantsCharge: 3,
        enfantsHandicapes: 1,
        autresChargeDependantes66: 1,
        autresChargeHandicapees: 2,
        autresCharge: 1,
        chargesFamilleAttribuees: false,
      },
      gestionnaire.cj,
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(await prisma.salarie.findUniqueOrThrow({ where: { id } })).toMatchObject({
      situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL',
      conjointRevenus: 'PENSION_LIMITEE',
      beneficiaireHandicape: true,
      enfantsCharge: 3,
      enfantsHandicapes: 1,
      autresChargeDependantes66: 1,
      autresChargeHandicapees: 2,
      autresCharge: 1,
      chargesFamilleAttribuees: false,
    });
  });

  it('refuse une situation fiscale incohérente par champ, sans rien écrire', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('sal-fiscal-refus');

    const res = await creer(
      entreprise.id,
      {
        ...salarieValide(),
        situationFamiliale: 'ISOLE',
        conjointRevenus: 'REVENUS',
        enfantsCharge: 1,
        enfantsHandicapes: 2,
        parentIsole: false,
        chargesFamilleAttribuees: true,
      },
      gestionnaire.cj,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).fields).toEqual({
      conjointRevenus: 'INVALID_CONJOINT_REVENUS',
      enfantsHandicapes: 'INVALID_ENFANTS_HANDICAPES',
      chargesFamilleAttribuees: 'INVALID_CHARGES_FAMILLE_ATTRIBUEES',
    });
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(0);
  });

  it('refuse un corps invalide par champ, sans rien écrire', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('sal-invalide');

    const res = await creer(
      entreprise.id,
      { ...salarieValide(), niss: '12345678901', iban: 'FR1420041010050500013M02606' },
      gestionnaire.cj,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'INVALID_NISS',
      fields: { niss: 'INVALID_NISS', iban: 'INVALID_IBAN' },
    });
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { cabinetId, action: 'SALARIE_CREATED' } })).toBe(
      0,
    );
  });

  it('refuse un corps qui n’est pas du JSON', async () => {
    const { gestionnaire, entreprise } = await mise('sal-pas-json');
    const res = await creer(entreprise.id, null, gestionnaire.cj);
    expect(res.status).toBe(400);
  });

  it('refuse une date de sortie à la création (D40 : elle se saisit à la sortie)', async () => {
    const { gestionnaire, entreprise } = await mise('sal-sortie');
    const res = await creer(
      entreprise.id,
      { ...salarieValide(), dateSortie: '2027-03-31' },
      gestionnaire.cj,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_DATE_SORTIE');
  });

  it('refuse un NISS déjà pris dans l’entreprise, archivé compris, sans rien laisser', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('sal-doublon');
    const niss = nissValide();
    const premier = await (await creer(entreprise.id, salarieValide(niss), gestionnaire.cj)).json();

    const doublon = await creer(entreprise.id, salarieValide(niss), gestionnaire.cj);
    expect(doublon.status).toBe(409);
    expect(await doublon.json()).toEqual({
      error: 'NISS_ALREADY_USED',
      fields: { niss: 'NISS_ALREADY_USED' },
    });

    // Archivé : le NISS reste pris, on restaure plutôt qu'on ne recrée.
    await prisma.salarie.update({ where: { id: premier.id }, data: { deletedAt: new Date() } });
    expect((await creer(entreprise.id, salarieValide(niss), gestionnaire.cj)).status).toBe(409);

    // Transaction annulée : un seul dossier, une seule condition, un seul audit.
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(1);
    expect(await prisma.conditionTravail.count({ where: { cabinetId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { cabinetId, action: 'SALARIE_CREATED' } })).toBe(
      1,
    );
  });

  it('accepte le même NISS dans une autre entreprise', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('sal-deux-entreprises');
    const autre = await creerEntreprise(cabinetId);
    await prisma.gestionnaireEntreprise.create({
      data: { entrepriseId: autre.id, userId: gestionnaire.user.id },
    });
    const niss = nissValide();

    expect((await creer(entreprise.id, salarieValide(niss), gestionnaire.cj)).status).toBe(201);
    expect((await creer(autre.id, salarieValide(niss), gestionnaire.cj)).status).toBe(201);
  });
});

describe('POST /api/entreprises/[id]/salaries : isolation', () => {
  it('404 pour une entreprise non assignée, d’un autre cabinet, archivée ou inconnue', async () => {
    const { cabinetId, gestionnaire } = await mise('sal-404');
    const { user: autreTitulaire } = await creerCompte('sal-404-autre');
    const nonAssignee = await creerEntreprise(cabinetId);
    const archivee = await creerEntreprise(cabinetId, { deletedAt: new Date() });
    const autreCabinet = await creerEntreprise(autreTitulaire.cabinetId!);
    // Même une assignation posée par erreur ne donne accès ni à un autre cabinet ni à une archivée.
    await prisma.gestionnaireEntreprise.createMany({
      data: [archivee, autreCabinet].map((e) => ({
        entrepriseId: e.id,
        userId: gestionnaire.user.id,
      })),
    });

    for (const id of [nonAssignee.id, archivee.id, autreCabinet.id, 'id-inconnu']) {
      const res = await creer(id, salarieValide(), gestionnaire.cj);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'ENTREPRISE_NOT_FOUND' });
    }
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(0);
    expect(await prisma.salarie.count({ where: { cabinetId: autreTitulaire.cabinetId! } })).toBe(0);
  });

  it('le périmètre est vérifié avant le corps : 404 même avec un corps invalide', async () => {
    const { cabinetId, gestionnaire } = await mise('sal-404-avant-400');
    const nonAssignee = await creerEntreprise(cabinetId);
    const res = await creer(nonAssignee.id, { n: 'importe quoi' }, gestionnaire.cj);
    expect(res.status).toBe(404);
  });

  it('ignore un cabinetId ou un entrepriseId glissé dans le corps', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('sal-corps-truque');
    const { user: autreTitulaire } = await creerCompte('sal-corps-truque-autre');
    const autre = await creerEntreprise(autreTitulaire.cabinetId!);

    const res = await creer(
      entreprise.id,
      { ...salarieValide(), cabinetId: autreTitulaire.cabinetId, entrepriseId: autre.id },
      gestionnaire.cj,
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(await prisma.salarie.findUniqueOrThrow({ where: { id } })).toMatchObject({
      cabinetId,
      entrepriseId: entreprise.id,
    });
  });

  it('une assignation retirée coupe l’écriture dès la requête suivante', async () => {
    const { gestionnaire, entreprise } = await mise('sal-retrait');
    expect((await creer(entreprise.id, salarieValide(), gestionnaire.cj)).status).toBe(201);

    await prisma.gestionnaireEntreprise.deleteMany({ where: { userId: gestionnaire.user.id } });

    expect((await creer(entreprise.id, salarieValide(), gestionnaire.cj)).status).toBe(404);
  });
});

describe('POST /api/entreprises/[id]/salaries : autorisations', () => {
  it('401 sans session', async () => {
    const { entreprise } = await mise('sal-401');
    expect((await creer(entreprise.id, salarieValide())).status).toBe(401);
  });

  it('403 pour le Cabinet RH, l’entreprise et le collaborateur : seul le gestionnaire écrit un dossier', async () => {
    const { cabinetId, cjTitulaire, entreprise } = await mise('sal-403');
    const adminEntreprise = await creerAvecRole('sal-403-ent', 'ENTREPRISE_CLIENTE', cabinetId);
    const collaborateur = await creerAvecRole('sal-403-col', 'COLLABORATEUR', cabinetId);

    for (const cj of [cjTitulaire, adminEntreprise.cj, collaborateur.cj]) {
      const res = await creer(entreprise.id, salarieValide(), cj);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'FORBIDDEN' });
    }
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(0);
  });

  it('423 quand le cabinet est en lecture seule, sans rien écrire (D29)', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('sal-423');
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus: 'RESILIE' } });

    const res = await creer(entreprise.id, salarieValide(), gestionnaire.cj);
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: 'CABINET_READ_ONLY' });
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(0);
  });
});
