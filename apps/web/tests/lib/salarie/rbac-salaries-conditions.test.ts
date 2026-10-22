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
const { POST: creerSalarie } = await import('@/app/api/entreprises/[id]/salaries/route');
const { POST: ajouter } = await import('@/app/api/salaries/[id]/conditions/route');
const { PUT: corriger, DELETE: annuler } =
  await import('@/app/api/salaries/[id]/conditions/[conditionId]/route');

afterAll(async () => {
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { cabinetId: true },
  });
  const cabinetIds = testUsers.map((u) => u.cabinetId).filter((id): id is string => !!id);
  // Les salariés et leurs conditions partent en cascade avec le cabinet.
  await prisma.auditLog.deleteMany({ where: { cabinetId: { in: cabinetIds } } });
  await prisma.cabinet.deleteMany({ where: { id: { in: cabinetIds } } });
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
  await prisma.cabinet.delete({ where: { id: user.cabinetId! } });
  return { cj, user: await prisma.user.findUniqueOrThrow({ where: { id: user.id } }) };
}

let vat = 80_000_000;
const creerEntreprise = (cabinetId: string, extra: { deletedAt?: Date } = {}) =>
  prisma.entreprise.create({
    data: { cabinetId, name: 'Entreprise de test', vatNumber: `BE0${++vat}`, ...extra },
  });

// NISS valides distincts : 9 chiffres de base, clé = 97 − (base mod 97).
let compteurNiss = 0;
const nissValide = () => {
  const base = 850730000 + 800 + ++compteurNiss;
  return `${base}${String(97 - (base % 97)).padStart(2, '0')}`;
};

// Jours relatifs à aujourd'hui : les tests restent justes quand la date réelle avance.
const jourDans = (jours: number) =>
  new Date(Date.now() + jours * 86_400_000).toISOString().slice(0, 10);
const ENTREE = jourDans(-400);

const salarieValide = (dateEntree = ENTREE) => ({
  nom: 'Dupont',
  prenom: 'Marie',
  niss: nissValide(),
  dateNaissance: '1985-07-30',
  iban: 'BE68 5390 0754 7034',
  typeContrat: 'CDI',
  dateEntree,
  statut: 'EMPLOYE',
  commissionParitaire: '200',
  fonction: 'Comptable',
  regime: 'TEMPS_PLEIN',
  salaireMensuelBrutCents: 280000,
  situationFamiliale: 'ISOLE',
  personnesCharge: 0,
});

// Une ligne de l'historique : un changement de fonction et de salaire à la date voulue.
const condition = (dateEffet: string, changes: Record<string, unknown> = {}) => ({
  dateEffet,
  statut: 'EMPLOYE',
  commissionParitaire: '200',
  fonction: 'Responsable',
  regime: 'TEMPS_PLEIN',
  salaireMensuelBrutCents: 310000,
  ...changes,
});

const entetes = (cj?: Jar) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return headers;
};

function creer(entrepriseId: string, body: unknown, cj?: Jar) {
  return creerSalarie(
    new Request(`http://localhost:3000/api/entreprises/${entrepriseId}/salaries`, {
      method: 'POST',
      headers: entetes(cj),
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: entrepriseId }) },
  );
}

const ajouterCondition = (salarieId: string, body: unknown, cj?: Jar) =>
  ajouter(
    new Request(`http://localhost:3000/api/salaries/${salarieId}/conditions`, {
      method: 'POST',
      headers: entetes(cj),
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: salarieId }) },
  );

const corrigerCondition = (salarieId: string, conditionId: string, body: unknown, cj?: Jar) =>
  corriger(
    new Request(`http://localhost:3000/api/salaries/${salarieId}/conditions/${conditionId}`, {
      method: 'PUT',
      headers: entetes(cj),
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: salarieId, conditionId }) },
  );

const annulerCondition = (salarieId: string, conditionId: string, cj?: Jar) =>
  annuler(
    new Request(`http://localhost:3000/api/salaries/${salarieId}/conditions/${conditionId}`, {
      method: 'DELETE',
      headers: entetes(cj),
    }),
    { params: Promise.resolve({ id: salarieId, conditionId }) },
  );

// Un cabinet, un gestionnaire assigné à une entreprise, un salarié déjà créé (entré il y a
// 400 jours, avec sa première condition à cette date).
async function mise(label: string, dateEntree = ENTREE) {
  const { user: titulaire, cj: cjTitulaire } = await creerCompte(`${label}-t`);
  const cabinetId = titulaire.cabinetId!;
  const gestionnaire = await creerAvecRole(`${label}-g`, 'GESTIONNAIRE_RH', cabinetId);
  const entreprise = await creerEntreprise(cabinetId);
  await prisma.gestionnaireEntreprise.create({
    data: { entrepriseId: entreprise.id, userId: gestionnaire.user.id },
  });
  const { id } = await (
    await creer(entreprise.id, salarieValide(dateEntree), gestionnaire.cj)
  ).json();
  const premiere = await prisma.conditionTravail.findFirstOrThrow({ where: { salarieId: id } });
  return {
    cabinetId,
    cjTitulaire,
    gestionnaire,
    entreprise,
    salarieId: id as string,
    premiere,
  };
}

const audits = (cabinetId: string, action: string) =>
  prisma.auditLog.findMany({ where: { cabinetId, action } });

describe('POST /api/salaries/[id]/conditions : ajout', () => {
  it('ajoute une ligne datée et l’audit, avec des identifiants seulement', async () => {
    const { cabinetId, gestionnaire, entreprise, salarieId } = await mise('cond-ajout');
    const date = jourDans(60);

    const res = await ajouterCondition(salarieId, condition(date), gestionnaire.cj);
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const ligne = await prisma.conditionTravail.findUniqueOrThrow({ where: { id } });
    expect(ligne).toMatchObject({
      cabinetId,
      salarieId,
      fonction: 'Responsable',
      salaireMensuelBrutCents: 310000,
      createdById: gestionnaire.user.id,
    });
    expect(ligne.dateEffet.toISOString().slice(0, 10)).toBe(date);
    // L'ancienne ligne n'est jamais modifiée.
    expect(await prisma.conditionTravail.count({ where: { salarieId } })).toBe(2);

    const [audit] = await audits(cabinetId, 'SALARIE_CONDITION_ADDED');
    expect(audit.metadata).toEqual({ salarieId, entrepriseId: entreprise.id, conditionId: id });
    for (const valeur of ['Responsable', '310000', date]) {
      expect(JSON.stringify(audit)).not.toContain(valeur);
    }
  });

  it('accepte une date passée (rattrapage), mais pas avant l’entrée ni après la sortie', async () => {
    const { gestionnaire, salarieId } = await mise('cond-bornes');

    // Rattrapage d'une augmentation oubliée, entre l'entrée (−400 j) et aujourd'hui.
    expect(
      (await ajouterCondition(salarieId, condition(jourDans(-200)), gestionnaire.cj)).status,
    ).toBe(201);

    const avant = await ajouterCondition(salarieId, condition(jourDans(-401)), gestionnaire.cj);
    expect(avant.status).toBe(409);
    expect(await avant.json()).toEqual({
      error: 'DATE_EFFET_OUT_OF_RANGE',
      fields: { dateEffet: 'DATE_EFFET_OUT_OF_RANGE' },
    });

    await prisma.salarie.update({
      where: { id: salarieId },
      data: { dateSortie: new Date(jourDans(100)) },
    });
    const apres = await ajouterCondition(salarieId, condition(jourDans(101)), gestionnaire.cj);
    expect(apres.status).toBe(409);
    expect((await apres.json()).error).toBe('DATE_EFFET_OUT_OF_RANGE');
    // Le jour de la sortie lui-même reste permis.
    expect(
      (await ajouterCondition(salarieId, condition(jourDans(100)), gestionnaire.cj)).status,
    ).toBe(201);
  });

  it('refuse une date déjà utilisée, y compris celle de l’entrée, sans rien écrire', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('cond-doublon');
    expect(
      (await ajouterCondition(salarieId, condition(jourDans(60)), gestionnaire.cj)).status,
    ).toBe(201);

    for (const date of [jourDans(60), ENTREE]) {
      const res = await ajouterCondition(salarieId, condition(date), gestionnaire.cj);
      expect(res.status, date).toBe(409);
      expect(await res.json()).toEqual({
        error: 'CONDITION_DATE_ALREADY_USED',
        fields: { dateEffet: 'CONDITION_DATE_ALREADY_USED' },
      });
    }
    expect(await prisma.conditionTravail.count({ where: { salarieId } })).toBe(2);
    expect(await audits(cabinetId, 'SALARIE_CONDITION_ADDED')).toHaveLength(1);
  });

  it('applique les règles de la condition : employé → ouvrier valide, CP incohérente refusée', async () => {
    const { gestionnaire, salarieId } = await mise('cond-regles');

    const ouvrier = condition(jourDans(30), {
      statut: 'OUVRIER',
      commissionParitaire: '100',
      salaireMensuelBrutCents: undefined,
      salaireHoraireBrutCents: 1750,
    });
    expect((await ajouterCondition(salarieId, ouvrier, gestionnaire.cj)).status).toBe(201);

    const mauvaise = await ajouterCondition(
      salarieId,
      condition(jourDans(31), { commissionParitaire: '100' }),
      gestionnaire.cj,
    );
    expect(mauvaise.status).toBe(400);
    expect(await mauvaise.json()).toEqual({
      error: 'INVALID_COMMISSION_PARITAIRE',
      fields: { commissionParitaire: 'INVALID_COMMISSION_PARITAIRE' },
    });
    expect((await ajouterCondition(salarieId, null, gestionnaire.cj)).status).toBe(400);
  });
});

describe('PUT /api/salaries/[id]/conditions/[conditionId] : correction', () => {
  it('corrige une ligne, sans changer sa date, et l’audit ne nomme que les champs', async () => {
    const { cabinetId, gestionnaire, entreprise, salarieId, premiere } = await mise('cond-corr');
    const date = premiere.dateEffet.toISOString().slice(0, 10);

    const res = await corrigerCondition(
      salarieId,
      premiere.id,
      condition(date, { fonction: 'Comptable senior', salaireMensuelBrutCents: 295000 }),
      gestionnaire.cj,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).changed.sort()).toEqual(['fonction', 'salaireMensuelBrutCents']);
    expect(
      await prisma.conditionTravail.findUniqueOrThrow({ where: { id: premiere.id } }),
    ).toMatchObject({
      fonction: 'Comptable senior',
      salaireMensuelBrutCents: 295000,
      dateEffet: premiere.dateEffet,
    });

    const [audit] = await audits(cabinetId, 'SALARIE_CONDITION_UPDATED');
    expect(audit.metadata).toEqual({
      salarieId,
      entrepriseId: entreprise.id,
      conditionId: premiere.id,
      fields: ['fonction', 'salaireMensuelBrutCents'],
    });
    for (const valeur of ['senior', '295000']) {
      expect(JSON.stringify(audit)).not.toContain(valeur);
    }
  });

  it('n’écrit rien et ne laisse aucune trace quand rien ne change', async () => {
    const { cabinetId, gestionnaire, salarieId, premiere } = await mise('cond-corr-rien');
    const date = premiere.dateEffet.toISOString().slice(0, 10);

    const res = await corrigerCondition(
      salarieId,
      premiere.id,
      condition(date, { fonction: 'Comptable', salaireMensuelBrutCents: 280000 }),
      gestionnaire.cj,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).changed).toEqual([]);
    expect(await audits(cabinetId, 'SALARIE_CONDITION_UPDATED')).toHaveLength(0);
  });

  it('refuse de changer la date d’une ligne (400)', async () => {
    const { gestionnaire, salarieId, premiere } = await mise('cond-corr-date');
    const res = await corrigerCondition(
      salarieId,
      premiere.id,
      condition(jourDans(-100)),
      gestionnaire.cj,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'INVALID_DATE_EFFET',
      fields: { dateEffet: 'INVALID_DATE_EFFET' },
    });
  });

  it('404 pour une ligne inconnue ou qui appartient à un autre dossier', async () => {
    const { gestionnaire, entreprise, salarieId } = await mise('cond-corr-404');
    const { id: autreId } = await (
      await creer(entreprise.id, salarieValide(), gestionnaire.cj)
    ).json();
    const ligneDeLAutre = await prisma.conditionTravail.findFirstOrThrow({
      where: { salarieId: autreId },
    });
    const date = ligneDeLAutre.dateEffet.toISOString().slice(0, 10);

    for (const conditionId of [ligneDeLAutre.id, 'condition-inconnue']) {
      const res = await corrigerCondition(salarieId, conditionId, condition(date), gestionnaire.cj);
      expect(res.status, conditionId).toBe(404);
      expect(await res.json()).toEqual({ error: 'CONDITION_NOT_FOUND' });
    }
    expect(
      (await prisma.conditionTravail.findUniqueOrThrow({ where: { id: ligneDeLAutre.id } }))
        .fonction,
    ).toBe('Comptable');
  });
});

describe('DELETE /api/salaries/[id]/conditions/[conditionId] : annulation', () => {
  it('annule un changement à venir et l’audit ne contient que des identifiants', async () => {
    const { cabinetId, gestionnaire, entreprise, salarieId } = await mise('cond-annule');
    const { id } = await (
      await ajouterCondition(salarieId, condition(jourDans(60)), gestionnaire.cj)
    ).json();

    const res = await annulerCondition(salarieId, id, gestionnaire.cj);
    expect(res.status).toBe(200);
    expect(await prisma.conditionTravail.count({ where: { id } })).toBe(0);

    const [audit] = await audits(cabinetId, 'SALARIE_CONDITION_REMOVED');
    expect(audit.metadata).toEqual({ salarieId, entrepriseId: entreprise.id, conditionId: id });
  });

  it('refuse une ligne en vigueur, passée, ou la première (celle de l’entrée)', async () => {
    const { cabinetId, gestionnaire, salarieId, premiere } = await mise('cond-annule-non');
    const { id: passee } = await (
      await ajouterCondition(salarieId, condition(jourDans(-200)), gestionnaire.cj)
    ).json();
    const { id: aujourdhui } = await (
      await ajouterCondition(salarieId, condition(jourDans(0)), gestionnaire.cj)
    ).json();

    for (const id of [passee, aujourdhui, premiere.id]) {
      const res = await annulerCondition(salarieId, id, gestionnaire.cj);
      expect(res.status, id).toBe(409);
      expect(await res.json()).toEqual({ error: 'CONDITION_NOT_REMOVABLE' });
    }
    expect(await prisma.conditionTravail.count({ where: { salarieId } })).toBe(3);
    expect(await audits(cabinetId, 'SALARIE_CONDITION_REMOVED')).toHaveLength(0);
  });

  it('refuse d’annuler la première ligne même quand l’entrée est dans le futur', async () => {
    const { gestionnaire, salarieId, premiere } = await mise('cond-annule-futur', jourDans(30));
    const res = await annulerCondition(salarieId, premiere.id, gestionnaire.cj);
    expect(res.status).toBe(409);
    expect(await prisma.conditionTravail.count({ where: { salarieId } })).toBe(1);
  });

  it('404 pour une ligne inconnue ou d’un autre dossier', async () => {
    const { gestionnaire, entreprise, salarieId } = await mise('cond-annule-404');
    const { id: autreId } = await (
      await creer(entreprise.id, salarieValide(jourDans(30)), gestionnaire.cj)
    ).json();
    const ligneDeLAutre = await prisma.conditionTravail.findFirstOrThrow({
      where: { salarieId: autreId },
    });
    for (const conditionId of [ligneDeLAutre.id, 'condition-inconnue']) {
      expect((await annulerCondition(salarieId, conditionId, gestionnaire.cj)).status).toBe(404);
    }
    expect(await prisma.conditionTravail.count({ where: { id: ligneDeLAutre.id } })).toBe(1);
  });
});

describe('routes des conditions : isolation', () => {
  it('404 pour un dossier d’une entreprise non assignée, d’un autre cabinet, archivé ou inconnu', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('cond-404');
    const { user: autreTitulaire } = await creerCompte('cond-404-autre');
    const nonAssignee = await creerEntreprise(cabinetId);
    const autreCabinet = await creerEntreprise(autreTitulaire.cabinetId!);

    const dossier = (cabinet: string, entrepriseId: string, nissHash: string) =>
      prisma.salarie.create({
        data: {
          cabinetId: cabinet,
          entrepriseId,
          nom: 'Autre',
          prenom: 'Eve',
          dateNaissance: new Date('1980-01-01'),
          nissEncrypted: 'x',
          nissHash,
          ibanEncrypted: 'x',
          typeContrat: 'CDI',
          dateEntree: new Date('2020-01-01'),
          situationFamiliale: 'ISOLE',
        },
      });
    const chezVoisin = await dossier(cabinetId, nonAssignee.id, 'h-cond-1');
    const etranger = await dossier(autreTitulaire.cabinetId!, autreCabinet.id, 'h-cond-2');
    const ligneVoisin = await prisma.conditionTravail.create({
      data: {
        cabinetId,
        salarieId: chezVoisin.id,
        dateEffet: new Date(jourDans(200)),
        statut: 'EMPLOYE',
        commissionParitaire: '200',
        fonction: 'Voisin',
        regime: 'TEMPS_PLEIN',
        salaireMensuelBrutCents: 100000,
      },
    });
    const archive = await prisma.salarie.update({
      where: { id: salarieId },
      data: { deletedAt: new Date() },
    });

    for (const id of [chezVoisin.id, etranger.id, archive.id, 'id-inconnu']) {
      for (const reponse of [
        await ajouterCondition(id, condition(jourDans(60)), gestionnaire.cj),
        await corrigerCondition(id, ligneVoisin.id, condition(jourDans(200)), gestionnaire.cj),
        await annulerCondition(id, ligneVoisin.id, gestionnaire.cj),
      ]) {
        expect(reponse.status, id).toBe(404);
        expect(await reponse.json()).toEqual({ error: 'SALARIE_NOT_FOUND' });
      }
    }
    // Rien n'a bougé chez le voisin.
    expect(await prisma.conditionTravail.count({ where: { salarieId: chezVoisin.id } })).toBe(1);
    expect(await prisma.conditionTravail.count({ where: { salarieId: etranger.id } })).toBe(0);
  });

  it('le périmètre est vérifié avant le corps : un dossier existant hors périmètre répond 404, jamais 400', async () => {
    const { cabinetId, gestionnaire } = await mise('cond-404-avant-400');
    const nonAssignee = await creerEntreprise(cabinetId);
    const chezVoisin = await prisma.salarie.create({
      data: {
        cabinetId,
        entrepriseId: nonAssignee.id,
        nom: 'Voisin',
        prenom: 'Paul',
        dateNaissance: new Date('1980-01-01'),
        nissEncrypted: 'x',
        nissHash: 'h-cond-3',
        ibanEncrypted: 'x',
        typeContrat: 'CDI',
        dateEntree: new Date('2020-01-01'),
        situationFamiliale: 'ISOLE',
      },
    });

    // Un 400 révélerait que le dossier existe.
    for (const body of [{ n: 'importe quoi' }, null]) {
      const ajout = await ajouterCondition(chezVoisin.id, body, gestionnaire.cj);
      const correction = await corrigerCondition(chezVoisin.id, 'c', body, gestionnaire.cj);
      expect(ajout.status).toBe(404);
      expect(correction.status).toBe(404);
    }
  });

  it('ignore un cabinetId, un salarieId ou un createdById glissés dans le corps', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('cond-truque');
    const { user: autreTitulaire } = await creerCompte('cond-truque-autre');

    const res = await ajouterCondition(
      salarieId,
      condition(jourDans(60), {
        cabinetId: autreTitulaire.cabinetId,
        salarieId: 'ailleurs',
        createdById: autreTitulaire.id,
      }),
      gestionnaire.cj,
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(await prisma.conditionTravail.findUniqueOrThrow({ where: { id } })).toMatchObject({
      cabinetId,
      salarieId,
      createdById: gestionnaire.user.id,
    });
  });

  it('une assignation retirée coupe l’écriture dès la requête suivante', async () => {
    const { gestionnaire, salarieId } = await mise('cond-retrait');
    expect(
      (await ajouterCondition(salarieId, condition(jourDans(60)), gestionnaire.cj)).status,
    ).toBe(201);

    await prisma.gestionnaireEntreprise.deleteMany({ where: { userId: gestionnaire.user.id } });

    expect(
      (await ajouterCondition(salarieId, condition(jourDans(90)), gestionnaire.cj)).status,
    ).toBe(404);
    expect(await prisma.conditionTravail.count({ where: { salarieId } })).toBe(2);
  });
});

describe('routes des conditions : autorisations', () => {
  it('401 sans session', async () => {
    const { salarieId, premiere } = await mise('cond-401');
    expect((await ajouterCondition(salarieId, condition(jourDans(60)))).status).toBe(401);
    expect(
      (await corrigerCondition(salarieId, premiere.id, condition(jourDans(-400)))).status,
    ).toBe(401);
    expect((await annulerCondition(salarieId, premiere.id)).status).toBe(401);
  });

  it('403 pour le Cabinet RH, l’entreprise et le collaborateur : seul le gestionnaire écrit', async () => {
    const { cabinetId, cjTitulaire, salarieId, premiere } = await mise('cond-403');
    const adminEntreprise = await creerAvecRole('cond-403-ent', 'ENTREPRISE_CLIENTE', cabinetId);
    const collaborateur = await creerAvecRole('cond-403-col', 'COLLABORATEUR', cabinetId);

    for (const cj of [cjTitulaire, adminEntreprise.cj, collaborateur.cj]) {
      for (const reponse of [
        await ajouterCondition(salarieId, condition(jourDans(60)), cj),
        await corrigerCondition(salarieId, premiere.id, condition(jourDans(-400)), cj),
        await annulerCondition(salarieId, premiere.id, cj),
      ]) {
        expect(reponse.status).toBe(403);
        expect(await reponse.json()).toEqual({ error: 'FORBIDDEN' });
      }
    }
    expect(await prisma.conditionTravail.count({ where: { salarieId } })).toBe(1);
  });

  it('423 quand le cabinet est en lecture seule, sans rien écrire (D29)', async () => {
    const { cabinetId, gestionnaire, salarieId, premiere } = await mise('cond-423');
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus: 'RESILIE' } });

    for (const reponse of [
      await ajouterCondition(salarieId, condition(jourDans(60)), gestionnaire.cj),
      await corrigerCondition(salarieId, premiere.id, condition(jourDans(-400)), gestionnaire.cj),
      await annulerCondition(salarieId, premiere.id, gestionnaire.cj),
    ]) {
      expect(reponse.status).toBe(423);
      expect(await reponse.json()).toEqual({ error: 'CABINET_READ_ONLY' });
    }
    expect(await prisma.conditionTravail.count({ where: { salarieId } })).toBe(1);
  });
});
