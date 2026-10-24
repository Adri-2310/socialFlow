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
const { decryptField } = await import('@/lib/crypto/field-encryption');
const { POST: creerSalarie } = await import('@/app/api/entreprises/[id]/salaries/route');
const { PATCH } = await import('@/app/api/salaries/[id]/route');

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

let vat = 70_000_000;
const creerEntreprise = (cabinetId: string, extra: { deletedAt?: Date } = {}) =>
  prisma.entreprise.create({
    data: { cabinetId, name: 'Entreprise de test', vatNumber: `BE0${++vat}`, ...extra },
  });

// NISS valides distincts : 9 chiffres de base, clé = 97 − (base mod 97).
let compteurNiss = 0;
const nissValide = () => {
  const base = 850730000 + 500 + ++compteurNiss;
  return `${base}${String(97 - (base % 97)).padStart(2, '0')}`;
};

const IBAN_A = 'BE68 5390 0754 7034';
const IBAN_B = 'BE26 4587 4596 3529';

const salarieValide = (niss = nissValide()) => ({
  nom: 'Dupont',
  prenom: 'Marie',
  niss,
  dateNaissance: '1985-07-30',
  email: 'marie@exemple.be',
  ville: 'Namur',
  iban: IBAN_A,
  typeContrat: 'CDI',
  dateEntree: '2026-11-01',
  statut: 'EMPLOYE',
  commissionParitaire: '200',
  fonction: 'Comptable',
  regime: 'TEMPS_PLEIN',
  salaireMensuelBrutCents: 280000,
  situationFamiliale: 'ISOLE',
  personnesCharge: 0,
});

// Le corps d'une modification : le dossier, sans les conditions de travail, ni NISS et IBAN
// (absents = inchangés), avec les changements demandés.
const modification = (changes: Record<string, unknown> = {}) => {
  const {
    niss: _niss,
    iban: _iban,
    statut: _statut,
    commissionParitaire: _cp,
    fonction: _fonction,
    regime: _regime,
    salaireMensuelBrutCents: _salaire,
    ...dossier
  } = salarieValide();
  return { ...dossier, ...changes };
};

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

function modifier(salarieId: string, body: unknown, cj?: Jar) {
  return PATCH(
    new Request(`http://localhost:3000/api/salaries/${salarieId}`, {
      method: 'PATCH',
      headers: entetes(cj),
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: salarieId }) },
  );
}

// Un cabinet, un gestionnaire assigné à une entreprise, un salarié déjà créé.
async function mise(label: string, niss = nissValide()) {
  const { user: titulaire, cj: cjTitulaire } = await creerCompte(`${label}-t`);
  const cabinetId = titulaire.cabinetId!;
  const gestionnaire = await creerAvecRole(`${label}-g`, 'GESTIONNAIRE_RH', cabinetId);
  const entreprise = await creerEntreprise(cabinetId);
  await prisma.gestionnaireEntreprise.create({
    data: { entrepriseId: entreprise.id, userId: gestionnaire.user.id },
  });
  const { id } = await (await creer(entreprise.id, salarieValide(niss), gestionnaire.cj)).json();
  return { cabinetId, cjTitulaire, gestionnaire, entreprise, salarieId: id as string, niss };
}

const auditsUpdated = (cabinetId: string) =>
  prisma.auditLog.findMany({ where: { cabinetId, action: 'SALARIE_UPDATED' } });

describe('PATCH /api/salaries/[id] : modification', () => {
  it('ne modifie que les champs changés et l’audit ne nomme que ces champs', async () => {
    const { cabinetId, gestionnaire, entreprise, salarieId } = await mise('upd-champs');

    const res = await modifier(
      salarieId,
      modification({ nom: 'Martin', ville: 'Liège', personnesCharge: 2 }),
      gestionnaire.cj,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).changed.sort()).toEqual(['nom', 'personnesCharge', 'ville']);

    expect(await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } })).toMatchObject({
      nom: 'Martin',
      prenom: 'Marie',
      ville: 'Liège',
      personnesCharge: 2,
    });

    const [audit] = await auditsUpdated(cabinetId);
    expect(audit.actorId).toBe(gestionnaire.user.id);
    expect(audit.metadata).toEqual({
      salarieId,
      entrepriseId: entreprise.id,
      fields: ['nom', 'ville', 'personnesCharge'],
    });
    // D8, D26 : jamais les valeurs, seulement le nom des champs.
    for (const valeur of ['Martin', 'Liège', 'Dupont', 'Marie']) {
      expect(JSON.stringify(audit)).not.toContain(valeur);
    }
  });

  it('n’écrit rien et ne laisse aucune trace quand rien ne change', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('upd-rien');
    const avant = await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } });

    const res = await modifier(salarieId, modification(), gestionnaire.cj);
    expect(res.status).toBe(200);
    expect((await res.json()).changed).toEqual([]);
    expect(await auditsUpdated(cabinetId)).toHaveLength(0);
    expect(
      (await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } })).updatedAt,
    ).toEqual(avant.updatedAt);
  });

  it('efface un champ facultatif absent', async () => {
    const { gestionnaire, salarieId } = await mise('upd-effacer');
    const { email: _email, ville: _ville, ...sansEmailNiVille } = modification();

    const res = await modifier(salarieId, sansEmailNiVille, gestionnaire.cj);
    expect((await res.json()).changed.sort()).toEqual(['email', 'ville']);
    expect(await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } })).toMatchObject({
      email: null,
      ville: null,
    });
  });

  it('change l’IBAN chiffré ; le retaper à l’identique ne compte pas', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('upd-iban');

    const res = await modifier(salarieId, modification({ iban: IBAN_B }), gestionnaire.cj);
    expect((await res.json()).changed).toEqual(['iban']);
    const enBase = await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } });
    expect(decryptField(enBase.ibanEncrypted)).toBe('BE26458745963529');
    expect(enBase.ibanEncrypted).not.toContain('4587');

    const encore = await modifier(salarieId, modification({ iban: IBAN_B }), gestionnaire.cj);
    expect((await encore.json()).changed).toEqual([]);
    expect(await auditsUpdated(cabinetId)).toHaveLength(1);
  });

  it('change le NISS et son empreinte ; refuse celui d’un autre dossier, accepte le sien', async () => {
    const { cabinetId, gestionnaire, entreprise, salarieId, niss } = await mise('upd-niss');
    const autre = nissValide();
    await creer(entreprise.id, salarieValide(autre), gestionnaire.cj);
    const avant = await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } });

    // Le sien, retapé : aucun changement, pas de conflit avec lui-même.
    const identique = await modifier(salarieId, modification({ niss }), gestionnaire.cj);
    expect(identique.status).toBe(200);
    expect((await identique.json()).changed).toEqual([]);

    // Celui d'un autre dossier de l'entreprise : refusé, rien n'est écrit.
    const doublon = await modifier(salarieId, modification({ niss: autre }), gestionnaire.cj);
    expect(doublon.status).toBe(409);
    expect(await doublon.json()).toEqual({
      error: 'NISS_ALREADY_USED',
      fields: { niss: 'NISS_ALREADY_USED' },
    });
    expect(await auditsUpdated(cabinetId)).toHaveLength(0);

    // Un NISS libre : accepté, chiffré, empreinte recalculée.
    const nouveau = nissValide();
    const ok = await modifier(salarieId, modification({ niss: nouveau }), gestionnaire.cj);
    expect((await ok.json()).changed).toEqual(['niss']);
    const apres = await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } });
    expect(decryptField(apres.nissEncrypted)).toBe(nouveau);
    expect(apres.nissHash).not.toBe(avant.nissHash);
  });

  it('NISS et IBAN absents restent inchangés', async () => {
    const { gestionnaire, salarieId, niss } = await mise('upd-absents');
    await modifier(salarieId, modification({ nom: 'Autre' }), gestionnaire.cj);
    const enBase = await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } });
    expect(decryptField(enBase.nissEncrypted)).toBe(niss);
    expect(decryptField(enBase.ibanEncrypted)).toBe('BE68539007547034');
  });
});

describe('PATCH /api/salaries/[id] : date d’entrée', () => {
  it('la première condition suit la date d’entrée', async () => {
    const { gestionnaire, salarieId } = await mise('upd-entree-suit');

    const res = await modifier(
      salarieId,
      modification({ dateEntree: '2026-10-01' }),
      gestionnaire.cj,
    );
    expect((await res.json()).changed).toEqual(['dateEntree']);

    const conditions = await prisma.conditionTravail.findMany({ where: { salarieId } });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].dateEffet.toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('refuse (409) si une autre condition se retrouverait avant ou le même jour', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('upd-entree-conflit');
    await prisma.conditionTravail.create({
      data: {
        cabinetId,
        salarieId,
        dateEffet: new Date('2027-04-01'),
        statut: 'EMPLOYE',
        commissionParitaire: '200',
        fonction: 'Responsable',
        regime: 'TEMPS_PLEIN',
        salaireMensuelBrutCents: 300000,
      },
    });

    for (const dateEntree of ['2027-04-01', '2027-06-01']) {
      const res = await modifier(salarieId, modification({ dateEntree }), gestionnaire.cj);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: 'DATE_ENTREE_CONFLICT',
        fields: { dateEntree: 'DATE_ENTREE_CONFLICT' },
      });
    }
    // Rien n'a bougé.
    const salarie = await prisma.salarie.findUniqueOrThrow({
      where: { id: salarieId },
      include: { conditions: { orderBy: { dateEffet: 'asc' } } },
    });
    expect(salarie.dateEntree.toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(salarie.conditions.map((c) => c.dateEffet.toISOString().slice(0, 10))).toEqual([
      '2026-11-01',
      '2027-04-01',
    ]);
    expect(await auditsUpdated(cabinetId)).toHaveLength(0);

    // Avant la deuxième condition, c'est permis.
    const ok = await modifier(
      salarieId,
      modification({ dateEntree: '2027-03-31' }),
      gestionnaire.cj,
    );
    expect(ok.status).toBe(200);
  });

  it('refuse une entrée postérieure à la date de sortie déjà enregistrée', async () => {
    const { gestionnaire, salarieId } = await mise('upd-entree-sortie');
    await prisma.salarie.update({
      where: { id: salarieId },
      data: { dateSortie: new Date('2027-01-31') },
    });
    const res = await modifier(
      salarieId,
      modification({ dateEntree: '2027-02-15' }),
      gestionnaire.cj,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('DATE_ENTREE_CONFLICT');
  });
});

describe('PATCH /api/salaries/[id] : validation', () => {
  it('refuse un corps invalide par champ, sans rien écrire', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('upd-invalide');

    const res = await modifier(
      salarieId,
      modification({ niss: '12345678901', typeContrat: 'CDD' }),
      gestionnaire.cj,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'INVALID_NISS',
      fields: { niss: 'INVALID_NISS', dateFinContrat: 'INVALID_DATE_FIN_CONTRAT' },
    });
    expect(await auditsUpdated(cabinetId)).toHaveLength(0);
  });

  it('refuse un corps qui n’est pas du JSON', async () => {
    const { gestionnaire, salarieId } = await mise('upd-pas-json');
    expect((await modifier(salarieId, null, gestionnaire.cj)).status).toBe(400);
  });

  it('refuse une date de sortie (D40 : elle a sa propre action)', async () => {
    const { gestionnaire, salarieId } = await mise('upd-sortie');
    const res = await modifier(
      salarieId,
      modification({ dateSortie: '2027-03-31' }),
      gestionnaire.cj,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_DATE_SORTIE');
  });

  it('ignore les conditions de travail et un cabinetId ou entrepriseId glissés dans le corps', async () => {
    const { cabinetId, gestionnaire, entreprise, salarieId } = await mise('upd-truque');
    const { user: autreTitulaire } = await creerCompte('upd-truque-autre');
    const autre = await creerEntreprise(autreTitulaire.cabinetId!);

    const res = await modifier(
      salarieId,
      modification({
        cabinetId: autreTitulaire.cabinetId,
        entrepriseId: autre.id,
        fonction: 'PDG',
        salaireMensuelBrutCents: 99999999,
      }),
      gestionnaire.cj,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).changed).toEqual([]);
    expect(await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } })).toMatchObject({
      cabinetId,
      entrepriseId: entreprise.id,
    });
    const condition = await prisma.conditionTravail.findFirstOrThrow({ where: { salarieId } });
    expect(condition).toMatchObject({ fonction: 'Comptable', salaireMensuelBrutCents: 280000 });
  });
});

describe('PATCH /api/salaries/[id] : isolation', () => {
  it('404 pour un dossier d’une entreprise non assignée, d’un autre cabinet, archivé ou inconnu', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('upd-404');
    const { user: autreTitulaire } = await creerCompte('upd-404-autre');
    const nonAssignee = await creerEntreprise(cabinetId);
    const autreCabinet = await creerEntreprise(autreTitulaire.cabinetId!);
    const chezVoisin = await prisma.salarie.create({
      data: {
        cabinetId,
        entrepriseId: nonAssignee.id,
        nom: 'Voisin',
        prenom: 'Paul',
        dateNaissance: new Date('1980-01-01'),
        nissEncrypted: 'x',
        nissHash: 'h1',
        ibanEncrypted: 'x',
        typeContrat: 'CDI',
        dateEntree: new Date('2026-01-01'),
        situationFamiliale: 'ISOLE',
      },
    });
    const autreSalarie = await prisma.salarie.create({
      data: {
        cabinetId: autreTitulaire.cabinetId!,
        entrepriseId: autreCabinet.id,
        nom: 'Etranger',
        prenom: 'Eve',
        dateNaissance: new Date('1980-01-01'),
        nissEncrypted: 'x',
        nissHash: 'h2',
        ibanEncrypted: 'x',
        typeContrat: 'CDI',
        dateEntree: new Date('2026-01-01'),
        situationFamiliale: 'ISOLE',
      },
    });
    const archive = await prisma.salarie.update({
      where: { id: salarieId },
      data: { deletedAt: new Date() },
    });

    for (const id of [chezVoisin.id, autreSalarie.id, archive.id, 'id-inconnu']) {
      const res = await modifier(id, modification({ nom: 'Piraté' }), gestionnaire.cj);
      expect(res.status, id).toBe(404);
      expect(await res.json()).toEqual({ error: 'SALARIE_NOT_FOUND' });
    }
    expect(await prisma.salarie.count({ where: { nom: 'Piraté' } })).toBe(0);
  });

  it('le périmètre est vérifié avant le corps : un dossier existant hors périmètre répond 404, jamais 400', async () => {
    const { cabinetId, gestionnaire } = await mise('upd-404-avant-400');
    const nonAssignee = await creerEntreprise(cabinetId);
    const chezVoisin = await prisma.salarie.create({
      data: {
        cabinetId,
        entrepriseId: nonAssignee.id,
        nom: 'Voisin',
        prenom: 'Paul',
        dateNaissance: new Date('1980-01-01'),
        nissEncrypted: 'x',
        nissHash: 'h-avant-400',
        ibanEncrypted: 'x',
        typeContrat: 'CDI',
        dateEntree: new Date('2026-01-01'),
        situationFamiliale: 'ISOLE',
      },
    });

    // Un 400 ici révélerait que le dossier existe : la réponse doit être identique à celle
    // d'un identifiant inconnu, quel que soit le corps.
    for (const body of [{ n: 'importe quoi' }, null, modification({ niss: '12345678901' })]) {
      const res = await modifier(chezVoisin.id, body, gestionnaire.cj);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'SALARIE_NOT_FOUND' });
    }
    expect((await modifier('id-inconnu', { n: 'x' }, gestionnaire.cj)).status).toBe(404);
  });

  it('une assignation retirée coupe la modification dès la requête suivante', async () => {
    const { gestionnaire, salarieId } = await mise('upd-retrait');
    expect(
      (await modifier(salarieId, modification({ nom: 'Avant' }), gestionnaire.cj)).status,
    ).toBe(200);

    await prisma.gestionnaireEntreprise.deleteMany({ where: { userId: gestionnaire.user.id } });

    expect(
      (await modifier(salarieId, modification({ nom: 'Après' }), gestionnaire.cj)).status,
    ).toBe(404);
    expect((await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } })).nom).toBe(
      'Avant',
    );
  });
});

describe('PATCH /api/salaries/[id] : autorisations', () => {
  it('401 sans session', async () => {
    const { salarieId } = await mise('upd-401');
    expect((await modifier(salarieId, modification())).status).toBe(401);
  });

  it('403 pour le Cabinet RH, l’entreprise et le collaborateur : seul le gestionnaire écrit un dossier', async () => {
    const { cabinetId, cjTitulaire, salarieId } = await mise('upd-403');
    const adminEntreprise = await creerAvecRole('upd-403-ent', 'ENTREPRISE_CLIENTE', cabinetId);
    const collaborateur = await creerAvecRole('upd-403-col', 'COLLABORATEUR', cabinetId);

    for (const cj of [cjTitulaire, adminEntreprise.cj, collaborateur.cj]) {
      const res = await modifier(salarieId, modification({ nom: 'Piraté' }), cj);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'FORBIDDEN' });
    }
    expect((await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } })).nom).toBe(
      'Dupont',
    );
  });

  it('423 quand le cabinet est en lecture seule, sans rien écrire (D29)', async () => {
    const { cabinetId, gestionnaire, salarieId } = await mise('upd-423');
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus: 'RESILIE' } });

    const res = await modifier(salarieId, modification({ nom: 'Piraté' }), gestionnaire.cj);
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: 'CABINET_READ_ONLY' });
    expect((await prisma.salarie.findUniqueOrThrow({ where: { id: salarieId } })).nom).toBe(
      'Dupont',
    );
  });
});
