import type { Scope } from '@/lib/authz/authz';
import { lookupHash } from '@/lib/crypto/field-encryption';
import { prisma } from '@/lib/prisma';
import { invalidFields, salarieSchema, type SalarieInput } from '@/lib/schemas/salarie';
import { CsvError, parseCsv } from '@/lib/salarie/csv';
import {
  COLONNES,
  colonneDuChamp,
  ligneVersCorps,
  normaliserEntete,
  resoudreColonne,
  type NomColonne,
} from '@/lib/salarie/import-columns';
import { findEntrepriseInScope } from '@/lib/salarie/salarie-data';
import { createSalarie } from '@/lib/salarie/salarie-write';

// Import CSV des dossiers salariés d'une entreprise (roles/03 § 4.1) : « rapport ligne par
// ligne : créées, ignorées, erreurs ».
//
// Deux temps, sans stockage du fichier : `verifierImport` analyse sans rien écrire,
// `lancerImport` crée les lignes valides. Le fichier contient des NISS et des IBAN en clair :
// il n'est ni conservé (on dévie ici de stockage.md, « CSV temporaire 1 jour », volontairement)
// ni répété dans le rapport, qui ne contient que des numéros de ligne, des noms de colonnes et
// des codes.
//
// Chaque ligne passe par `createSalarie` : mêmes règles, même chiffrement et même audit qu'une
// création manuelle. Une ligne invalide n'empêche pas les autres d'être créées.

export const IMPORT_MAX_OCTETS = 1_000_000;
export const IMPORT_MAX_LIGNES = 200;

export type ImportFailure =
  | { error: 'ENTREPRISE_NOT_FOUND' }
  | { error: 'IMPORT_EMPTY' }
  | { error: 'IMPORT_TOO_LARGE' }
  | { error: 'IMPORT_TOO_MANY_ROWS' }
  | { error: 'CSV_INVALID' }
  | { error: 'MISSING_COLUMNS'; colonnes: string[] }
  | { error: 'UNKNOWN_COLUMNS'; colonnes: string[] }
  | { error: 'DUPLICATE_COLUMNS'; colonnes: string[] };

export type LigneRapport =
  | { ligne: number; resultat: 'ERREUR'; details: { colonne: string; code: string }[] }
  | {
      ligne: number;
      resultat: 'IGNOREE';
      raison: 'NISS_DEJA_PRESENT' | 'NISS_ARCHIVE' | 'NISS_DOUBLON_FICHIER';
    };

export type RapportImport = {
  total: number;
  // À créer (vérification) ou créées (import).
  creees: number;
  ignorees: number;
  erreurs: number;
  // Seulement les lignes ignorées ou en erreur, par ordre de ligne.
  lignes: LigneRapport[];
};

type Preparee = { ligne: number; corps: SalarieInput };

type Preparation =
  | { ok: true; entrepriseId: string; aCreer: Preparee[]; total: number; lignes: LigneRapport[] }
  | ({ ok: false } & ImportFailure);

// Pas de colonne pour une erreur qui concerne la ligne entière (cellules en trop).
const LIGNE_ENTIERE = '(ligne)';

async function preparer(scope: Scope, entrepriseId: string, csv: string): Promise<Preparation> {
  const entreprise = await findEntrepriseInScope(scope, entrepriseId);
  if (!entreprise || scope.kind !== 'entreprises') {
    return { ok: false, error: 'ENTREPRISE_NOT_FOUND' };
  }
  if (Buffer.byteLength(csv, 'utf8') > IMPORT_MAX_OCTETS) {
    return { ok: false, error: 'IMPORT_TOO_LARGE' };
  }

  let table;
  try {
    table = parseCsv(csv);
  } catch (error) {
    if (error instanceof CsvError) return { ok: false, error: 'CSV_INVALID' };
    throw error;
  }
  if (table.headers.length === 0) return { ok: false, error: 'IMPORT_EMPTY' };

  // En-têtes : reconnus quelle que soit la casse, la ponctuation ou une écriture naturelle
  // (« Date de naissance ») ; une colonne sans nom (séparateur de trop en fin de ligne) est
  // ignorée. Contrôlés avant les lignes : un fichier sans données mais aux colonnes fausses
  // doit dire quelles colonnes corriger.
  const colonnes = table.headers.map((entete) =>
    normaliserEntete(entete) === '' ? '' : resoudreColonne(entete),
  );
  const inconnues = table.headers.filter((_, i) => colonnes[i] === null);
  if (inconnues.length > 0) return { ok: false, error: 'UNKNOWN_COLUMNS', colonnes: inconnues };
  const nommees = colonnes.filter((c): c is NomColonne => c !== '' && c !== null);
  const doublons = [...new Set(nommees.filter((c, i) => nommees.indexOf(c) !== i))];
  if (doublons.length > 0) return { ok: false, error: 'DUPLICATE_COLUMNS', colonnes: doublons };
  const manquantes = COLONNES.filter((c) => c.obligatoire && !nommees.includes(c.nom)).map(
    (c) => c.nom,
  );
  if (manquantes.length > 0) return { ok: false, error: 'MISSING_COLUMNS', colonnes: manquantes };

  if (table.rows.length === 0) return { ok: false, error: 'IMPORT_EMPTY' };
  if (table.rows.length > IMPORT_MAX_LIGNES) return { ok: false, error: 'IMPORT_TOO_MANY_ROWS' };

  const lignes: LigneRapport[] = [];
  const valides: { ligne: number; corps: SalarieInput; hash: string }[] = [];
  let total = 0;

  table.rows.forEach((cellules, index) => {
    if (cellules.every((c) => c.trim() === '')) return; // « ;;; » : rien à importer
    const ligne = table.lignes[index];
    total += 1;

    // Une cellule de plus que d'en-têtes : décalage probable, on ne devine pas.
    const enTrop = cellules.slice(colonnes.length).some((c) => c.trim() !== '');
    if (enTrop) {
      lignes.push({
        ligne,
        resultat: 'ERREUR',
        details: [{ colonne: LIGNE_ENTIERE, code: 'COLONNES_EN_TROP' }],
      });
      return;
    }

    const valeurs: Partial<Record<NomColonne, string>> = {};
    colonnes.forEach((nom, i) => {
      if (nom !== '' && nom !== null) valeurs[nom] = cellules[i] ?? '';
    });

    const analyse = salarieSchema.safeParse(ligneVersCorps(valeurs));
    if (!analyse.success) {
      const parColonne = new Map<string, string>();
      for (const [champ, code] of Object.entries(invalidFields(analyse.error))) {
        const colonne = colonneDuChamp(champ) ?? LIGNE_ENTIERE;
        if (!parColonne.has(colonne)) parColonne.set(colonne, code);
      }
      lignes.push({
        ligne,
        resultat: 'ERREUR',
        details: [...parColonne].map(([colonne, code]) => ({ colonne, code })),
      });
      return;
    }
    valides.push({
      ligne,
      corps: analyse.data,
      hash: lookupHash(entreprise.id, analyse.data.niss),
    });
  });

  // Doublons : dans le fichier même, puis dans l'entreprise (archivés compris : le NISS d'un
  // dossier archivé reste réservé, on le restaure plutôt que de le recréer).
  const existants = await prisma.salarie.findMany({
    where: {
      cabinetId: scope.cabinetId,
      entrepriseId: entreprise.id,
      nissHash: { in: valides.map((v) => v.hash) },
    },
    select: { nissHash: true, deletedAt: true },
  });
  const enBase = new Map(existants.map((e) => [e.nissHash, e.deletedAt !== null]));
  const vus = new Set<string>();
  const aCreer: Preparee[] = [];

  for (const v of valides) {
    if (vus.has(v.hash)) {
      lignes.push({ ligne: v.ligne, resultat: 'IGNOREE', raison: 'NISS_DOUBLON_FICHIER' });
    } else if (enBase.has(v.hash)) {
      lignes.push({
        ligne: v.ligne,
        resultat: 'IGNOREE',
        raison: enBase.get(v.hash) ? 'NISS_ARCHIVE' : 'NISS_DEJA_PRESENT',
      });
    } else {
      aCreer.push({ ligne: v.ligne, corps: v.corps });
    }
    vus.add(v.hash);
  }

  lignes.sort((a, b) => a.ligne - b.ligne);
  return { ok: true, entrepriseId: entreprise.id, aCreer, total, lignes };
}

const compter = (lignes: LigneRapport[], resultat: LigneRapport['resultat']) =>
  lignes.filter((l) => l.resultat === resultat).length;

// Analyse le fichier sans rien écrire : ce que l'import créerait, ignorerait, refuserait.
export async function verifierImport(
  scope: Scope,
  entrepriseId: string,
  csv: string,
): Promise<{ ok: true; rapport: RapportImport } | ({ ok: false } & ImportFailure)> {
  const prep = await preparer(scope, entrepriseId, csv);
  if (!prep.ok) return prep;
  return {
    ok: true,
    rapport: {
      total: prep.total,
      creees: prep.aCreer.length,
      ignorees: compter(prep.lignes, 'IGNOREE'),
      erreurs: compter(prep.lignes, 'ERREUR'),
      lignes: prep.lignes,
    },
  };
}

// Crée les lignes valides, une par une (chacune dans sa transaction, avec son audit). Si
// l'assignation du gestionnaire est retirée en cours de route, on s'arrête : les dossiers déjà
// créés restent créés et audités.
export async function lancerImport(
  scope: Scope,
  actorId: string,
  entrepriseId: string,
  csv: string,
): Promise<{ ok: true; rapport: RapportImport } | ({ ok: false } & ImportFailure)> {
  const prep = await preparer(scope, entrepriseId, csv);
  if (!prep.ok) return prep;

  const lignes = [...prep.lignes];
  let creees = 0;
  for (const { ligne, corps } of prep.aCreer) {
    const resultat = await createSalarie(scope, actorId, prep.entrepriseId, corps);
    if (resultat.ok) {
      creees += 1;
    } else if (resultat.error === 'NISS_ALREADY_USED') {
      // Créé entre la vérification et ici (autre onglet, autre gestionnaire).
      lignes.push({ ligne, resultat: 'IGNOREE', raison: 'NISS_DEJA_PRESENT' });
    } else {
      return { ok: false, error: 'ENTREPRISE_NOT_FOUND' };
    }
  }
  lignes.sort((a, b) => a.ligne - b.ligne);

  const rapport: RapportImport = {
    total: prep.total,
    creees,
    ignorees: compter(lignes, 'IGNOREE'),
    erreurs: compter(lignes, 'ERREUR'),
    lignes,
  };

  // D8, D26 : des comptes seulement. Chaque dossier créé a déjà son entrée SALARIE_CREATED.
  if (scope.kind === 'entreprises') {
    await prisma.auditLog.create({
      data: {
        action: 'SALARIES_IMPORTED',
        cabinetId: scope.cabinetId,
        actorId,
        metadata: {
          entrepriseId: prep.entrepriseId,
          creees: rapport.creees,
          ignorees: rapport.ignorees,
          erreurs: rapport.erreurs,
        },
      },
    });
  }

  return { ok: true, rapport };
}
