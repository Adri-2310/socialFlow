import {
  casDeLaVersion,
  CAS_REFERENCE_2026,
  type CasReference,
  verifierCasReference,
} from '../cas-reference';
import { ErreurMoteur } from '../erreurs';
import type { VersionAvecParametres } from '../fiche';
import { verifierPasDeChevauchement } from './choisir';
import type { VersionBaremeComplete } from './schema';

// GARDE-FOU D'ACTIVATION D'UN BARÈME (modules/paie.md § 5, étape 9.5, D119).
//
// « Un barème n'est jamais activé si un cas de référence échoue » (D22). `peutActiverBareme` répond à
// la question que se pose le SuperAdmin avant de passer une version de `A_VERIFIER` à `ACTIF` : y a-t-il
// une raison de la refuser ? Elle renvoie TOUTES les raisons d'un coup, en français, pour que rien ne
// soit découvert l'un après l'autre. Fonction pure : aucune base de données, aucune horloge ; l'écran
// d'activation (chantier F) l'appellera avant d'écrire le statut.

export interface ResultatActivation {
  ok: boolean;
  raisons: string[];
  // Présent (et vrai) seulement quand l'activation n'est acceptée que grâce à la dérogation de D122 :
  // aucun cas de référence ne couvre la version. Absent sinon.
  sansCasReference?: true;
}

// D122 : la dérogation lève UNIQUEMENT l'absence de cas de référence (aucun cas dans la période, ou
// catégorie d'employeur sans cas). Un cas qui échoue, un bloc manquant, une fiabilité à confirmer ou un
// chevauchement ne se dérogent jamais.
export interface OptionsActivation {
  derogationSansCasReference?: boolean;
}

// Les blocs sans lesquels `calculerFiche` ne peut pas calculer (ils sont tous exigés par `exigerBloc`).
export const BLOCS_OBLIGATOIRES = [
  'onss',
  'bonusEmploi',
  'precompte',
  'csss',
  'cotisationsPatronales',
  'reductionStructurelle',
  'heuresSupplementaires',
  'joursFeries',
  'salaireGaranti',
  'anomalies',
] as const;

// Catégorie d'employeur des cas de référence actuels (D98).
const CATEGORIE_DES_CAS = 'PRIVE_MARCHAND';

// Nombre d'écarts de cas de référence cités en détail : au-delà, on compte seulement les autres.
const ECARTS_CITES = 5;

export function peutActiverBareme(
  version: VersionBaremeComplete,
  autres: readonly VersionAvecParametres[],
  cas: readonly CasReference[] = CAS_REFERENCE_2026,
  options: OptionsActivation = {},
): ResultatActivation {
  const raisons: string[] = [];
  let sansCasReference = false;

  // 1. Seule une version à vérifier s'active : une version déjà active ou retirée ne change pas.
  if (version.statut !== 'A_VERIFIER') {
    raisons.push(
      `Seule une version à vérifier peut être activée (statut actuel : ${version.statut}).`,
    );
  }

  // 2. Les dix blocs du calcul.
  const manquants = BLOCS_OBLIGATOIRES.filter((bloc) => version.parametres[bloc] === undefined);
  for (const bloc of manquants) raisons.push(`Bloc manquant : ${bloc}.`);

  // 3. La fiabilité de chaque bloc présent : OFFICIELLE et DECISION_INTERNE passent, A_CONFIRMER et
  // l'absence de fiabilité bloquent (D115).
  for (const bloc of BLOCS_OBLIGATOIRES) {
    if (version.parametres[bloc] === undefined) continue;
    const fiabilite = version.source[bloc]?.fiabilite;
    if (fiabilite === undefined) {
      raisons.push(`Fiabilité absente pour le bloc ${bloc} : à préciser avant l'activation.`);
    } else if (fiabilite === 'A_CONFIRMER') {
      raisons.push(`Le bloc ${bloc} est encore à confirmer.`);
    }
  }

  // 4. Une seule version active couvre un mois pour une catégorie (D99).
  const actives = autres.filter((v) => v.statut === 'ACTIF' && v.code !== version.code);
  const candidate: VersionAvecParametres = {
    code: version.code,
    valideDepuis: version.valideDepuis,
    valideJusqua: version.valideJusqua,
    statut: 'ACTIF',
    categorieEmployeur: version.categorieEmployeur,
    parametres: version.parametres,
  };
  let chevauchement = false;
  try {
    verifierPasDeChevauchement([...actives, candidate]);
  } catch (e) {
    if (!(e instanceof ErreurMoteur)) throw e;
    chevauchement = true;
    raisons.push(e.message);
  }

  // 5. Les cas de référence qui tombent dans la période de la version.
  if (version.categorieEmployeur !== CATEGORIE_DES_CAS) {
    if (options.derogationSansCasReference) {
      sansCasReference = true;
    } else {
      raisons.push(
        `Aucun cas de référence pour la catégorie d'employeur ${version.categorieEmployeur}.`,
      );
    }
  } else {
    const concernes = casDeLaVersion(version, cas);
    if (concernes.length === 0) {
      if (options.derogationSansCasReference) {
        sansCasReference = true;
      } else {
        raisons.push(
          'Aucun cas de référence ne tombe dans la période de cette version : elle ne peut pas être validée.',
        );
      }
    } else if (manquants.length === 0 && !chevauchement) {
      // Rejoués (sauf si les versions se chevauchent : le choix du barème serait ambigu) avec les versions déjà actives et la candidate, comme ils le seraient en production.
      const { ecarts } = verifierCasReference([...actives, candidate], concernes);
      for (const e of ecarts.slice(0, ECARTS_CITES)) {
        raisons.push(`Cas ${e.casId} : ${e.champ}, attendu ${e.attendu}, obtenu ${e.obtenu}.`);
      }
      if (ecarts.length > ECARTS_CITES) {
        raisons.push(
          `... et ${ecarts.length - ECARTS_CITES} autre(s) écart(s) de cas de référence.`,
        );
      }
    }
  }

  const ok = raisons.length === 0;
  return ok && sansCasReference ? { ok, raisons, sansCasReference: true } : { ok, raisons };
}
