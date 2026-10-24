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
const { resolveScope } = await import('@/lib/authz/authz');
const { getSalarieDetail, getSalariesEntreprise } = await import('@/lib/salarie/salarie-data');
const { POST: creerSalarie } = await import('@/app/api/entreprises/[id]/salaries/route');
const {
  PATCH: modifierSalarie,
  DELETE: archiver,
  PUT: restaurer,
} = await import('@/app/api/salaries/[id]/route');
const { PUT: sortie } = await import('@/app/api/salaries/[id]/sortie/route');
const { POST: ajouterCondition } = await import('@/app/api/salaries/[id]/conditions/route');
const { POST: devoiler } = await import('@/app/api/salaries/[id]/reveal/route');

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

let vat = 95_000_000;
const creerEntreprise = (cabinetId: string, extra: { deletedAt?: Date } = {}) =>
  prisma.entreprise.create({
    data: { cabinetId, name: 'Entreprise de test', vatNumber: `BE0${++vat}`, ...extra },
  });

// NISS valides distincts : 9 chiffres de base, clé = 97 − (base mod 97).
let compteurNiss = 0;
const nissValide = () => {
  const base = 850730000 + 950 + ++compteurNiss;
  return `${base}${String(97 - (base % 97)).padStart(2, '0')}`;
};

// Jours relatifs à aujourd'hui : les tests restent justes quand la date réelle avance.
const jourDans = (jours: number) =>
  new Date(Date.now() + jours * 86_400_000).toISOString().slice(0, 10);
const ENTREE = jourDans(-400);

const salarieValide = () => ({
  nom: 'Dupont',
  prenom: 'Marie',
  niss: nissValide(),
  dateNaissance: '1985-07-30',
  iban: 'BE68 5390 0754 7034',
  typeContrat: 'CDI',
  dateEntree: ENTREE,
  statut: 'EMPLOYE',
  commissionParitaire: '200',
  fonction: 'Comptable',
  regime: 'TEMPS_PLEIN',
  salaireMensuelBrutCents: 280000,
  situationFamiliale: 'ISOLE',
  enfantsCharge: 0,
});

const entetes = (cj?: Jar) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return headers;
};

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function creer(entrepriseId: string, body: unknown, cj?: Jar) {
  return creerSalarie(
    new Request(`http://localhost:3000/api/entreprises/${entrepriseId}/salaries`, {
      method: 'POST',
      headers: entetes(cj),
      body: JSON.stringify(body),
    }),
    ctx(entrepriseId),
  );
}

const url = (id: string, suite = '') => `http://localhost:3000/api/salaries/${id}${suite}`;
const enregistrerSortie = (id: string, body: unknown, cj?: Jar) =>
  sortie(
    new Request(url(id, '/sortie'), {
      method: 'PUT',
      headers: entetes(cj),
      body: JSON.stringify(body),
    }),
    ctx(id),
  );
const archiverDossier = (id: string, cj?: Jar) =>
  archiver(new Request(url(id), { method: 'DELETE', headers: entetes(cj) }), ctx(id));
const restaurerDossier = (id: string, cj?: Jar) =>
  restaurer(new Request(url(id), { method: 'PUT', headers: entetes(cj) }), ctx(id));

// Un cabinet, un gestionnaire assigné à une entreprise, un salarié entré il y a 400 jours.
async function mise(label: string) {
  const { user: titulaire, cj: cjTitulaire } = await creerCompte(`${label}-t`);
  const cabinetId = titulaire.cabinetId!;
  const gestionnaire = await creerAvecRole(`${label}-g`, 'GESTIONNAIRE_RH', cabinetId);
  const entreprise = await creerEntreprise(cabinetId);
  await prisma.gestionnaireEntreprise.create({
    data: { entrepriseId: entreprise.id, userId: gestionnaire.user.id },
  });
  const { id } = await (await creer(entreprise.id, salarieValide(), gestionnaire.cj)).json();
  return { cabinetId, cjTitulaire, gestionnaire, entreprise, salarieId: id as string };
}

const audits = (cabinetId: string, action: string) =>
  prisma.auditLog.findMany({ where: { cabinetId, action } });

describe('PUT /api/salaries/[id]/sortie : sortie', () => {
  it('enregistre la sortie, garde le dossier actif et journalise sans la date', async () => {
    const { cabinetId, gestionnaire, entreprise, salarieId } = await mise('sortie-enreg');
    const date = jourDans(30);

    const res = await enregistrerSortie(salarieId, { dateSortie: date }, gestionnaire.cj);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, changed: true });

    const salarie = await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } });
    expect(salarie.dateSortie?.toISOString().slice(0, 10)).toBe(date);
    // La sortie n'archive pas : il faut encore la dernière fiche.
    expect(salarie.deletedAt).toBeNull();

    const [audit] = await audits(cabinetId, 'SALARIE_SORTIE_RECORDED');
    expect(audit.actorId).toBe(gestionnaire.user.id);
    expect(audit.metadata).toEqual({ salarieId, entrepriseId: entreprise.id });
    expect(JSON.stringify(audit)).not.toContain(date);
  });

  it('corrige la date, efface la sortie, et ne laisse rien quand rien ne change', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('sortie-corr');

    await enregistrerSortie(salarieId, { dateSortie: jourDans(30) }, gestionnaire.cj);
    const identique = await enregistrerSortie(
      salarieId,
      { dateSortie: jourDans(30) },
      gestionnaire.cj,
    );
    expect((await identique.json()).changed).toBe(false);
    expect(await audits(cabinetId, 'SALARIE_SORTIE_RECORDED')).toHaveLength(1);

    const corrigee = await enregistrerSortie(
      salarieId,
      { dateSortie: jourDans(45) },
      gestionnaire.cj,
    );
    expect((await corrigee.json()).changed).toBe(true);
    expect(await audits(cabinetId, 'SALARIE_SORTIE_RECORDED')).toHaveLength(2);

    const effacee = await enregistrerSortie(salarieId, { dateSortie: null }, gestionnaire.cj);
    expect((await effacee.json()).changed).toBe(true);
    expect(
      (await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } })).dateSortie,
    ).toBeNull();
    expect(await audits(cabinetId, 'SALARIE_SORTIE_CLEARED')).toHaveLength(1);

    // Effacer une sortie qui n'existe pas : rien à faire, aucune trace.
    const rien = await enregistrerSortie(salarieId, { dateSortie: null }, gestionnaire.cj);
    expect((await rien.json()).changed).toBe(false);
    expect(await audits(cabinetId, 'SALARIE_SORTIE_CLEARED')).toHaveLength(1);
  });

  it('refuse une sortie avant l’entrée (409), sans rien écrire', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('sortie-avant');
    const res = await enregistrerSortie(salarieId, { dateSortie: jourDans(-401) }, gestionnaire.cj);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'DATE_SORTIE_OUT_OF_RANGE',
      fields: { dateSortie: 'DATE_SORTIE_OUT_OF_RANGE' },
    });
    expect(await audits(cabinetId, 'SALARIE_SORTIE_RECORDED')).toHaveLength(0);
    // Le jour de l'entrée lui-même reste permis.
    expect(
      (await enregistrerSortie(salarieId, { dateSortie: ENTREE }, gestionnaire.cj)).status,
    ).toBe(200);
  });

  it('refuse une sortie antérieure à une condition de travail, jusqu’à ce qu’on l’annule', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('sortie-condition');
    await prisma.conditionTravail.create({
      data: {
        cabinetId,
        salarieId,
        dateEffet: new Date(jourDans(60)),
        statut: 'EMPLOYE',
        commissionParitaire: '200',
        fonction: 'Responsable',
        regime: 'TEMPS_PLEIN',
        salaireMensuelBrutCents: 310000,
      },
    });

    const trop = await enregistrerSortie(salarieId, { dateSortie: jourDans(59) }, gestionnaire.cj);
    expect(trop.status).toBe(409);
    expect(await trop.json()).toEqual({
      error: 'CONDITION_AFTER_SORTIE',
      fields: { dateSortie: 'CONDITION_AFTER_SORTIE' },
    });
    // Le jour même de la condition reste permis.
    expect(
      (await enregistrerSortie(salarieId, { dateSortie: jourDans(60) }, gestionnaire.cj)).status,
    ).toBe(200);
  });

  it('refuse un corps invalide, sans rien écrire', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('sortie-invalide');
    for (const body of [{}, { dateSortie: '31/12/2026' }, { dateSortie: 42 }, null]) {
      const res = await enregistrerSortie(salarieId, body, gestionnaire.cj);
      expect(res.status).toBe(400);
    }
    expect(await audits(cabinetId, 'SALARIE_SORTIE_RECORDED')).toHaveLength(0);
  });
});

describe('DELETE et PUT /api/salaries/[id] : archivage et restauration', () => {
  it('archive sans date de sortie, journalise, et le dossier quitte la liste active', async () => {
    const { cabinetId, gestionnaire, entreprise, salarieId } = await mise('arch-archive');

    const res = await archiverDossier(salarieId, gestionnaire.cj);
    expect(res.status).toBe(200);

    const enBase = await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } });
    // Jamais supprimé : soft-delete.
    expect(enBase.deletedAt).not.toBeNull();
    expect(enBase.nom).toBe('Dupont');

    const [audit] = await audits(cabinetId, 'SALARIE_ARCHIVED');
    expect(audit.actorId).toBe(gestionnaire.user.id);
    expect(audit.metadata).toEqual({ salarieId, entrepriseId: entreprise.id });
    expect(JSON.stringify(audit)).not.toContain('Dupont');

    const scope = (await resolveScope(gestionnaire.user))!;
    const actifs = await getSalariesEntreprise(scope, entreprise.id);
    const archives = await getSalariesEntreprise(scope, entreprise.id, new Date(), {
      archives: true,
    });
    expect(actifs?.salaries).toHaveLength(0);
    expect(actifs?.nbArchives).toBe(1);
    expect(archives?.salaries.map((s) => s.id)).toEqual([salarieId]);
  });

  it('la fiche d’un dossier archivé reste lisible, mais seulement sur demande', async () => {
    const { gestionnaire, salarieId } = await mise('arch-fiche');
    await archiverDossier(salarieId, gestionnaire.cj);
    const scope = (await resolveScope(gestionnaire.user))!;

    expect(await getSalarieDetail(scope, salarieId)).toBeNull();
    const fiche = await getSalarieDetail(scope, salarieId, new Date(), { includeArchived: true });
    expect(fiche).toMatchObject({ id: salarieId, archive: true, nissMasque: '85.07.**-***.**' });
  });

  it('un dossier archivé ne se modifie plus : modification, condition, sortie et dévoilement répondent 404', async () => {
    const { gestionnaire, salarieId } = await mise('arch-fige');
    await archiverDossier(salarieId, gestionnaire.cj);

    const modification = await modifierSalarie(
      new Request(url(salarieId), {
        method: 'PATCH',
        headers: entetes(gestionnaire.cj),
        body: JSON.stringify({ nom: 'Piraté' }),
      }),
      ctx(salarieId),
    );
    const condition = await ajouterCondition(
      new Request(url(salarieId, '/conditions'), {
        method: 'POST',
        headers: entetes(gestionnaire.cj),
        body: JSON.stringify({}),
      }),
      ctx(salarieId),
    );
    const sortieRes = await enregistrerSortie(
      salarieId,
      { dateSortie: jourDans(30) },
      gestionnaire.cj,
    );
    const reveal = await devoiler(
      new Request(url(salarieId, '/reveal'), {
        method: 'POST',
        headers: entetes(gestionnaire.cj),
        body: JSON.stringify({ field: 'niss' }),
      }),
      ctx(salarieId),
    );

    for (const res of [modification, condition, sortieRes, reveal]) {
      expect(res.status).toBe(404);
    }
    expect((await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } })).nom).toBe(
      'Dupont',
    );
  });

  it('refuse d’archiver deux fois (409) et de restaurer un dossier actif (409)', async () => {
    const { gestionnaire, salarieId } = await mise('arch-double');

    const restaureActif = await restaurerDossier(salarieId, gestionnaire.cj);
    expect(restaureActif.status).toBe(409);
    expect(await restaureActif.json()).toEqual({ error: 'SALARIE_NOT_ARCHIVED' });

    expect((await archiverDossier(salarieId, gestionnaire.cj)).status).toBe(200);
    const encore = await archiverDossier(salarieId, gestionnaire.cj);
    expect(encore.status).toBe(409);
    expect(await encore.json()).toEqual({ error: 'SALARIE_ALREADY_ARCHIVED' });
  });

  it('restaure le dossier : il revient dans la liste active, sortie conservée, avec audit', async () => {
    const { cabinetId, gestionnaire, entreprise, salarieId } = await mise('arch-restaure');
    await enregistrerSortie(salarieId, { dateSortie: jourDans(30) }, gestionnaire.cj);
    await archiverDossier(salarieId, gestionnaire.cj);

    const res = await restaurerDossier(salarieId, gestionnaire.cj);
    expect(res.status).toBe(200);

    const scope = (await resolveScope(gestionnaire.user))!;
    const actifs = await getSalariesEntreprise(scope, entreprise.id);
    expect(actifs?.salaries.map((s) => s.id)).toEqual([salarieId]);
    expect(actifs?.salaries[0].dateSortie?.toISOString().slice(0, 10)).toBe(jourDans(30));
    expect(actifs?.nbArchives).toBe(0);
    expect(await audits(cabinetId, 'SALARIE_RESTORED')).toHaveLength(1);
  });
});

describe('sortie et archivage : isolation', () => {
  it('404 pour un dossier d’une entreprise non assignée, d’un autre cabinet, d’une entreprise archivée ou inconnu', async () => {
    const { cabinetId, gestionnaire } = await mise('lc-404');
    const { user: autreTitulaire } = await creerCompte('lc-404-autre');
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

    let hash = 0;
    const dossier = (cabinet: string, entrepriseId: string) =>
      prisma.salarie.create({
        data: {
          cabinetId: cabinet,
          entrepriseId,
          nom: 'Autre',
          prenom: 'Eve',
          dateNaissance: new Date('1980-01-01'),
          nissEncrypted: 'v1:a:b:c',
          nissHash: `h-lc-${++hash}-${Date.now()}`,
          ibanEncrypted: 'v1:a:b:c',
          typeContrat: 'CDI',
          dateEntree: new Date('2020-01-01'),
          situationFamiliale: 'ISOLE',
        },
      });
    const ids = [
      (await dossier(cabinetId, nonAssignee.id)).id,
      (await dossier(cabinetId, entrepriseArchivee.id)).id,
      (await dossier(autreTitulaire.cabinetId!, autreCabinet.id)).id,
      'id-inconnu',
    ];

    for (const id of ids) {
      for (const res of [
        await enregistrerSortie(id, { dateSortie: jourDans(30) }, gestionnaire.cj),
        await archiverDossier(id, gestionnaire.cj),
        await restaurerDossier(id, gestionnaire.cj),
      ]) {
        expect(res.status, id).toBe(404);
        expect(await res.json()).toEqual({ error: 'SALARIE_NOT_FOUND' });
      }
    }
    // Rien n'a bougé chez les autres.
    expect(
      await prisma.salarie.count({ where: { id: { in: ids }, deletedAt: { not: null } } }),
    ).toBe(0);
    expect(
      await prisma.salarie.count({ where: { id: { in: ids }, dateSortie: { not: null } } }),
    ).toBe(0);
  });

  it('le périmètre est vérifié avant le corps : un dossier existant hors périmètre répond 404, jamais 400', async () => {
    const { cabinetId, gestionnaire } = await mise('lc-404-avant-400');
    const nonAssignee = await creerEntreprise(cabinetId);
    const chezVoisin = await prisma.salarie.create({
      data: {
        cabinetId,
        entrepriseId: nonAssignee.id,
        nom: 'Voisin',
        prenom: 'Paul',
        dateNaissance: new Date('1980-01-01'),
        nissEncrypted: 'v1:a:b:c',
        nissHash: `h-lc-avant-${Date.now()}`,
        ibanEncrypted: 'v1:a:b:c',
        typeContrat: 'CDI',
        dateEntree: new Date('2020-01-01'),
        situationFamiliale: 'ISOLE',
      },
    });

    // Un 400 révélerait que le dossier existe.
    for (const body of [{}, { dateSortie: 'pas une date' }, null]) {
      expect((await enregistrerSortie(chezVoisin.id, body, gestionnaire.cj)).status).toBe(404);
    }
  });

  it('une assignation retirée coupe sortie, archivage et restauration dès la requête suivante', async () => {
    const { gestionnaire, salarieId } = await mise('lc-retrait');
    await archiverDossier(salarieId, gestionnaire.cj);

    await prisma.gestionnaireEntreprise.deleteMany({ where: { userId: gestionnaire.user.id } });

    expect((await restaurerDossier(salarieId, gestionnaire.cj)).status).toBe(404);
    expect(
      (await enregistrerSortie(salarieId, { dateSortie: jourDans(30) }, gestionnaire.cj)).status,
    ).toBe(404);
    expect(
      (await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } })).deletedAt,
    ).not.toBeNull();
  });
});

describe('sortie et archivage : autorisations', () => {
  it('401 sans session', async () => {
    const { salarieId } = await mise('lc-401');
    expect((await enregistrerSortie(salarieId, { dateSortie: null })).status).toBe(401);
    expect((await archiverDossier(salarieId)).status).toBe(401);
    expect((await restaurerDossier(salarieId)).status).toBe(401);
  });

  it('403 pour le Cabinet RH, l’entreprise et le collaborateur : seul le gestionnaire écrit', async () => {
    const { cabinetId, cjTitulaire, salarieId } = await mise('lc-403');
    const adminEntreprise = await creerAvecRole('lc-403-ent', 'ENTREPRISE_CLIENTE', cabinetId);
    const collaborateur = await creerAvecRole('lc-403-col', 'COLLABORATEUR', cabinetId);

    for (const cj of [cjTitulaire, adminEntreprise.cj, collaborateur.cj]) {
      for (const res of [
        await enregistrerSortie(salarieId, { dateSortie: jourDans(30) }, cj),
        await archiverDossier(salarieId, cj),
        await restaurerDossier(salarieId, cj),
      ]) {
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'FORBIDDEN' });
      }
    }
    const enBase = await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } });
    expect(enBase.deletedAt).toBeNull();
    expect(enBase.dateSortie).toBeNull();
  });

  it('423 quand le cabinet est en lecture seule, sans rien écrire (D29)', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('lc-423');
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus: 'RESILIE' } });

    for (const res of [
      await enregistrerSortie(salarieId, { dateSortie: jourDans(30) }, gestionnaire.cj),
      await archiverDossier(salarieId, gestionnaire.cj),
      await restaurerDossier(salarieId, gestionnaire.cj),
    ]) {
      expect(res.status).toBe(423);
      expect(await res.json()).toEqual({ error: 'CABINET_READ_ONLY' });
    }
    const enBase = await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } });
    expect(enBase.deletedAt).toBeNull();
    expect(enBase.dateSortie).toBeNull();
  });
});
