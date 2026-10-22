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
const { decryptField } = await import('@/lib/crypto/field-encryption');
const { POST: importer } = await import('@/app/api/entreprises/[id]/salaries/import/route');
const { GET: modele } = await import('@/app/api/entreprises/[id]/salaries/import/modele/route');
const { COLONNES } = await import('@/lib/salarie/import-columns');

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

let vat = 97_000_000;
const creerEntreprise = (cabinetId: string, extra: { deletedAt?: Date } = {}) =>
  prisma.entreprise.create({
    data: { cabinetId, name: 'Entreprise de test', vatNumber: `BE0${++vat}`, ...extra },
  });

// NISS valides distincts : 9 chiffres de base, clé = 97 − (base mod 97).
let compteurNiss = 0;
const nissValide = () => {
  const base = 850730000 + 980 + ++compteurNiss;
  return `${base}${String(97 - (base % 97)).padStart(2, '0')}`;
};

// --- construction des fichiers CSV de test ---

const ENTETE = COLONNES.map((c) => c.nom);

// Une ligne valide : employé à temps plein, entré il y a longtemps. `surcharge` en change des cellules.
const ligne = (surcharge: Record<string, string> = {}) => {
  const valeurs: Record<string, string> = {
    prenom: 'Marie',
    nom: 'Dupont',
    niss: nissValide(),
    date_naissance: '30/07/1985',
    iban: 'BE68 5390 0754 7034',
    statut: 'employé',
    type_contrat: 'CDI',
    date_entree: '01/11/2024',
    fonction: 'Comptable',
    regime: 'temps plein',
    salaire: '2850,00',
    situation_familiale: 'isolé',
    ...surcharge,
  };
  return ENTETE.map((nom) => valeurs[nom] ?? '').join(';');
};

const csv = (...lignes: string[]) => [ENTETE.join(';'), ...lignes].join('\r\n') + '\r\n';

const entetes = (cj?: Jar) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookie = cj?.headers().get('cookie');
  if (cookie) headers.cookie = cookie;
  return headers;
};

const lancer = (entrepriseId: string, body: unknown, cj?: Jar) =>
  importer(
    new Request(`http://localhost:3000/api/entreprises/${entrepriseId}/salaries/import`, {
      method: 'POST',
      headers: entetes(cj),
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: entrepriseId }) },
  );
const verifier = (entrepriseId: string, fichier: string, cj?: Jar) =>
  lancer(entrepriseId, { csv: fichier, confirmer: false }, cj);
const importerFichier = (entrepriseId: string, fichier: string, cj?: Jar) =>
  lancer(entrepriseId, { csv: fichier, confirmer: true }, cj);
const telecharger = (entrepriseId: string, cj?: Jar) =>
  modele(
    new Request(`http://localhost:3000/api/entreprises/${entrepriseId}/salaries/import/modele`, {
      headers: entetes(cj),
    }),
    { params: Promise.resolve({ id: entrepriseId }) },
  );

// Un cabinet, un gestionnaire assigné à une entreprise vide.
async function mise(label: string) {
  const { user: titulaire, cj: cjTitulaire } = await creerCompte(`${label}-t`);
  const cabinetId = titulaire.cabinetId!;
  const gestionnaire = await creerAvecRole(`${label}-g`, 'GESTIONNAIRE_RH', cabinetId);
  const entreprise = await creerEntreprise(cabinetId);
  await prisma.gestionnaireEntreprise.create({
    data: { entrepriseId: entreprise.id, userId: gestionnaire.user.id },
  });
  return { cabinetId, cjTitulaire, gestionnaire, entreprise };
}

const audits = (cabinetId: string, action: string) =>
  prisma.auditLog.findMany({ where: { cabinetId, action } });

describe('GET …/salaries/import/modele : modèle', () => {
  it('renvoie un CSV téléchargeable avec toutes les colonnes, sans rien de réel', async () => {
    const { gestionnaire, entreprise } = await mise('imp-modele');

    const res = await telecharger(entreprise.id, gestionnaire.cj);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    // Response.text() retire le BOM : on le cherche dans les octets (EF BB BF), car c'est lui
    // qui fait lire l'UTF-8 à Excel.
    const octets = new Uint8Array(await res.clone().arrayBuffer());
    expect([...octets.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const texte = await res.text();
    for (const colonne of ENTETE) expect(texte).toContain(colonne);
  });

  it('reste possible en lecture seule (D29), et 404 hors périmètre', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('imp-modele-ro');
    const nonAssignee = await creerEntreprise(cabinetId);
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus: 'RESILIE' } });

    expect((await telecharger(entreprise.id, gestionnaire.cj)).status).toBe(200);
    expect((await telecharger(nonAssignee.id, gestionnaire.cj)).status).toBe(404);
    expect((await telecharger(entreprise.id)).status).toBe(401);
  });
});

describe('POST …/salaries/import : vérification (rien n’est écrit)', () => {
  it('annonce ce qui serait créé, ignoré ou refusé, sans écrire ni journaliser', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('imp-verif');
    const existant = nissValide();
    const archive = nissValide();
    const doublon = nissValide();
    // Un dossier déjà présent et un archivé, posés par un premier import.
    await importerFichier(
      entreprise.id,
      csv(ligne({ niss: existant }), ligne({ niss: archive })),
      gestionnaire.cj,
    );
    const dossiers = await prisma.salarie.findMany({ where: { entrepriseId: entreprise.id } });
    const archives = dossiers.find((d) => decryptField(d.nissEncrypted) === archive)!;
    await prisma.salarie.update({ where: { id: archives.id }, data: { deletedAt: new Date() } });
    const avant = await prisma.salarie.count({ where: { cabinetId } });
    const auditsAvant = await prisma.auditLog.count({ where: { cabinetId } });

    const res = await verifier(
      entreprise.id,
      csv(
        ligne(), // 2 : à créer
        ligne({ niss: nissValide() }), // 3 : à créer
        ligne({ niss: '12345678901' }), // 4 : NISS invalide
        ligne({ niss: doublon }), // 5 : à créer
        ligne({ niss: doublon }), // 6 : doublon du fichier
        ligne({ niss: existant }), // 7 : déjà dans l'entreprise
        ligne({ niss: archive }), // 8 : dossier archivé
      ),
      gestionnaire.cj,
    );

    expect(res.status).toBe(200);
    const { mode, rapport } = await res.json();
    expect(mode).toBe('verification');
    expect(rapport).toMatchObject({ total: 7, creees: 3, ignorees: 3, erreurs: 1 });
    expect(rapport.lignes).toEqual([
      { ligne: 4, resultat: 'ERREUR', details: [{ colonne: 'niss', code: 'INVALID_NISS' }] },
      { ligne: 6, resultat: 'IGNOREE', raison: 'NISS_DOUBLON_FICHIER' },
      { ligne: 7, resultat: 'IGNOREE', raison: 'NISS_DEJA_PRESENT' },
      { ligne: 8, resultat: 'IGNOREE', raison: 'NISS_ARCHIVE' },
    ]);
    // Rien n'a été écrit, rien n'a été journalisé.
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(avant);
    expect(await prisma.auditLog.count({ where: { cabinetId } })).toBe(auditsAvant);
  });

  it('le rapport ne répète jamais une valeur du fichier : ni NISS, ni IBAN, ni nom', async () => {
    const { gestionnaire, entreprise } = await mise('imp-secret');
    const niss = nissValide();
    const fichier = csv(
      ligne({ niss, prenom: 'Zéphyrine', nom: 'Quasimodo', date_entree: '31/02/2026' }),
      ligne({ niss: '12345678901', iban: 'FR1420041010050500013M02606' }),
    );

    const res = await verifier(entreprise.id, fichier, gestionnaire.cj);
    const brut = JSON.stringify(await res.json());
    for (const secret of [niss, '12345678901', 'Zéphyrine', 'Quasimodo', '5390', 'FR1420']) {
      expect(brut).not.toContain(secret);
    }
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('signale chaque colonne fautive d’une ligne, avec la colonne de l’en-tête', async () => {
    const { gestionnaire, entreprise } = await mise('imp-colonnes');
    const res = await verifier(
      entreprise.id,
      csv(ligne({ date_entree: '31/02/2026', salaire: '12,345', type_contrat: 'CDD' })),
      gestionnaire.cj,
    );
    const { rapport } = await res.json();
    expect(rapport.erreurs).toBe(1);
    const colonnes = rapport.lignes[0].details.map((d: { colonne: string }) => d.colonne).sort();
    expect(colonnes).toEqual(['date_entree', 'salaire']);
  });
});

describe('POST …/salaries/import : import', () => {
  it('crée les lignes valides comme une création manuelle : chiffrées, première condition, audit', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('imp-cree');
    const niss1 = nissValide();
    const niss2 = nissValide();

    const res = await importerFichier(
      entreprise.id,
      csv(
        ligne({ niss: niss1, prenom: 'Claire' }),
        ligne({ niss: niss2, prenom: 'Marc', statut: 'ouvrier', salaire: '17,25' }),
      ),
      gestionnaire.cj,
    );
    expect(res.status).toBe(200);
    const { mode, rapport } = await res.json();
    expect(mode).toBe('import');
    expect(rapport).toMatchObject({ total: 2, creees: 2, ignorees: 0, erreurs: 0, lignes: [] });

    const dossiers = await prisma.salarie.findMany({
      where: { cabinetId },
      include: { conditions: true },
      orderBy: { prenom: 'asc' },
    });
    expect(dossiers.map((d) => d.prenom)).toEqual(['Claire', 'Marc']);
    for (const dossier of dossiers) {
      expect(dossier.entrepriseId).toBe(entreprise.id);
      expect(dossier.nissEncrypted).not.toContain(niss1);
      expect(dossier.conditions).toHaveLength(1);
    }
    expect(decryptField(dossiers[0].nissEncrypted)).toBe(niss1);
    expect(dossiers[0].conditions[0]).toMatchObject({
      statut: 'EMPLOYE',
      commissionParitaire: '200',
      salaireMensuelBrutCents: 285000,
      createdById: gestionnaire.user.id,
    });
    expect(dossiers[1].conditions[0]).toMatchObject({
      statut: 'OUVRIER',
      commissionParitaire: '100',
      salaireHoraireBrutCents: 1725,
    });

    // Chaque dossier garde son audit, plus un résumé avec des comptes seulement.
    expect(await audits(cabinetId, 'SALARIE_CREATED')).toHaveLength(2);
    const [resume] = await audits(cabinetId, 'SALARIES_IMPORTED');
    expect(resume.actorId).toBe(gestionnaire.user.id);
    expect(resume.metadata).toEqual({
      entrepriseId: entreprise.id,
      creees: 2,
      ignorees: 0,
      erreurs: 0,
    });
    for (const secret of [niss1, niss2, 'Claire', 'Marc']) {
      expect(JSON.stringify(resume)).not.toContain(secret);
    }
  });

  it('une ligne invalide n’empêche pas les autres d’être créées', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('imp-partiel');
    const res = await importerFichier(
      entreprise.id,
      csv(ligne({ prenom: 'Un' }), ligne({ niss: '12345678901' }), ligne({ prenom: 'Trois' })),
      gestionnaire.cj,
    );
    const { rapport } = await res.json();
    expect(rapport).toMatchObject({ total: 3, creees: 2, ignorees: 0, erreurs: 1 });
    expect(rapport.lignes.map((l: { ligne: number }) => l.ligne)).toEqual([3]);
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(2);
  });

  it('relancer le même fichier ne crée rien de plus : tout est ignoré', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('imp-relance');
    const fichier = csv(ligne(), ligne());

    expect(
      (await (await importerFichier(entreprise.id, fichier, gestionnaire.cj)).json()).rapport
        .creees,
    ).toBe(2);
    const seconde = await importerFichier(entreprise.id, fichier, gestionnaire.cj);
    const { rapport } = await seconde.json();

    expect(rapport).toMatchObject({ creees: 0, ignorees: 2, erreurs: 0 });
    expect(rapport.lignes.every((l: { raison: string }) => l.raison === 'NISS_DEJA_PRESENT')).toBe(
      true,
    );
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(2);
  });

  it('comprend un fichier d’Excel : BOM, séparateur virgule, guillemets, en-têtes avec accents', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('imp-excel');
    const entete = [
      'Prénom',
      'Nom',
      'NISS',
      'Date de naissance',
      'IBAN',
      'Statut',
      'Type contrat',
      'Date entrée',
      'Fonction',
      'Régime',
      'Salaire',
      'Situation familiale',
    ];
    const valeurs = [
      'Zoé',
      'Dupont, Jr',
      nissValide(),
      '30/07/1985',
      'BE68 5390 0754 7034',
      'Employé',
      'cdi',
      '2024-11-01',
      'Chef, comptable',
      'Temps plein',
      '"2 850,50"',
      'Isolé',
    ];
    const fichier = `﻿${entete.join(',')}\n${valeurs.map((v) => (v.includes(',') && !v.startsWith('"') ? `"${v}"` : v)).join(',')}\n`;

    const res = await importerFichier(entreprise.id, fichier, gestionnaire.cj);
    expect((await res.json()).rapport).toMatchObject({ creees: 1, erreurs: 0 });
    const dossier = await prisma.salarie.findFirstOrThrow({
      where: { cabinetId },
      include: { conditions: true },
    });
    expect(dossier).toMatchObject({ prenom: 'Zoé', nom: 'Dupont, Jr' });
    expect(dossier.conditions[0]).toMatchObject({
      fonction: 'Chef, comptable',
      salaireMensuelBrutCents: 285050,
    });
  });
});

describe('POST …/salaries/import : fichier inutilisable', () => {
  it('refuse un fichier sans colonne obligatoire, avec un colonne inconnue ou en double', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('imp-colonnes-globales');

    const sansNiss = ENTETE.filter((c) => c !== 'niss' && c !== 'iban');
    const manquantes = await verifier(entreprise.id, `${sansNiss.join(';')}\r\n`, gestionnaire.cj);
    expect(manquantes.status).toBe(400);
    expect(await manquantes.json()).toEqual({
      error: 'MISSING_COLUMNS',
      colonnes: ['niss', 'iban'],
    });

    // Un cabinetId ou un entrepriseId n'est pas une colonne : il ne peut pas être glissé.
    const inconnue = await verifier(
      entreprise.id,
      `${ENTETE.join(';')};cabinetId\r\n${ligne()};autre-cabinet\r\n`,
      gestionnaire.cj,
    );
    expect(inconnue.status).toBe(400);
    expect(await inconnue.json()).toEqual({ error: 'UNKNOWN_COLUMNS', colonnes: ['cabinetId'] });

    const double = await verifier(
      entreprise.id,
      `${ENTETE.join(';')};nom\r\n${ligne()};X\r\n`,
      gestionnaire.cj,
    );
    expect(double.status).toBe(400);
    expect(await double.json()).toEqual({ error: 'DUPLICATE_COLUMNS', colonnes: ['nom'] });
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(0);
  });

  it('refuse un fichier vide, mal formé, trop long ou trop gros', async () => {
    const { gestionnaire, entreprise } = await mise('imp-limites');

    const vide = await verifier(entreprise.id, `${ENTETE.join(';')}\r\n`, gestionnaire.cj);
    expect(vide.status).toBe(400);
    expect((await vide.json()).error).toBe('IMPORT_EMPTY');

    const guillemet = await verifier(
      entreprise.id,
      `${ENTETE.join(';')}\r\n"Marie;`,
      gestionnaire.cj,
    );
    expect(guillemet.status).toBe(400);
    expect((await guillemet.json()).error).toBe('CSV_INVALID');

    // 200 lignes passent, 201 non.
    const lignes = Array.from({ length: 201 }, () => ligne());
    const trop = await verifier(entreprise.id, csv(...lignes), gestionnaire.cj);
    expect(trop.status).toBe(400);
    expect((await trop.json()).error).toBe('IMPORT_TOO_MANY_ROWS');
    const limite = await verifier(entreprise.id, csv(...lignes.slice(0, 200)), gestionnaire.cj);
    expect(limite.status).toBe(200);

    const gros = await verifier(entreprise.id, 'x'.repeat(1_000_001), gestionnaire.cj);
    expect(gros.status).toBe(413);
    expect((await gros.json()).error).toBe('IMPORT_TOO_LARGE');
  });

  it('refuse un corps qui n’est pas { csv, confirmer }', async () => {
    const { gestionnaire, entreprise } = await mise('imp-corps');
    for (const body of [null, {}, { csv: 12 }, { csv: 'a;b', confirmer: 'oui' }]) {
      const res = await lancer(entreprise.id, body, gestionnaire.cj);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('INVALID_REQUEST');
    }
  });

  it('une ligne avec une cellule de trop est refusée, sans deviner un décalage', async () => {
    const { gestionnaire, entreprise } = await mise('imp-trop');
    const res = await verifier(entreprise.id, csv(`${ligne()};inattendu`), gestionnaire.cj);
    const { rapport } = await res.json();
    expect(rapport.lignes).toEqual([
      {
        ligne: 2,
        resultat: 'ERREUR',
        details: [{ colonne: '(ligne)', code: 'COLONNES_EN_TROP' }],
      },
    ]);
  });
});

describe('POST …/salaries/import : isolation et autorisations', () => {
  it('404 sans rien créer pour une entreprise non assignée, d’un autre cabinet, archivée ou inconnue', async () => {
    const { cabinetId, gestionnaire } = await mise('imp-404');
    const { user: autreTitulaire } = await creerCompte('imp-404-autre');
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
      for (const confirmer of [false, true]) {
        const res = await lancer(id, { csv: csv(ligne()), confirmer }, gestionnaire.cj);
        expect(res.status, id).toBe(404);
        expect(await res.json()).toEqual({ error: 'ENTREPRISE_NOT_FOUND' });
      }
    }
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(0);
    expect(await prisma.salarie.count({ where: { cabinetId: autreTitulaire.cabinetId! } })).toBe(0);
  });

  it('le périmètre est vérifié avant le corps : une entreprise existante hors périmètre répond 404, jamais 400', async () => {
    const { cabinetId, gestionnaire } = await mise('imp-404-avant-400');
    const nonAssignee = await creerEntreprise(cabinetId);
    for (const body of [null, {}, { csv: 12 }]) {
      expect((await lancer(nonAssignee.id, body, gestionnaire.cj)).status).toBe(404);
    }
  });

  it('une assignation retirée coupe l’import dès la requête suivante', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('imp-retrait');
    expect((await importerFichier(entreprise.id, csv(ligne()), gestionnaire.cj)).status).toBe(200);

    await prisma.gestionnaireEntreprise.deleteMany({ where: { userId: gestionnaire.user.id } });

    expect((await importerFichier(entreprise.id, csv(ligne()), gestionnaire.cj)).status).toBe(404);
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(1);
  });

  it('401 sans session', async () => {
    const { entreprise } = await mise('imp-401');
    expect((await verifier(entreprise.id, csv(ligne()))).status).toBe(401);
  });

  it('403 pour le Cabinet RH, l’entreprise et le collaborateur : seul le gestionnaire importe', async () => {
    const { cabinetId, cjTitulaire, entreprise } = await mise('imp-403');
    const adminEntreprise = await creerAvecRole('imp-403-ent', 'ENTREPRISE_CLIENTE', cabinetId);
    const collaborateur = await creerAvecRole('imp-403-col', 'COLLABORATEUR', cabinetId);

    for (const cj of [cjTitulaire, adminEntreprise.cj, collaborateur.cj]) {
      for (const res of [
        await verifier(entreprise.id, csv(ligne()), cj),
        await importerFichier(entreprise.id, csv(ligne()), cj),
        await telecharger(entreprise.id, cj),
      ]) {
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'FORBIDDEN' });
      }
    }
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(0);
  });

  it('423 quand le cabinet est en lecture seule, sans rien écrire (D29)', async () => {
    const { cabinetId, gestionnaire, entreprise } = await mise('imp-423');
    await prisma.cabinet.update({ where: { id: cabinetId }, data: { billingStatus: 'RESILIE' } });

    for (const confirmer of [false, true]) {
      const res = await lancer(entreprise.id, { csv: csv(ligne()), confirmer }, gestionnaire.cj);
      expect(res.status).toBe(423);
      expect(await res.json()).toEqual({ error: 'CABINET_READ_ONLY' });
    }
    expect(await prisma.salarie.count({ where: { cabinetId } })).toBe(0);
  });
});
