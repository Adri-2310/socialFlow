import { arrondirFraction } from './arrondi';
import { joursDuMois } from './calendrier';
import { ErreurMoteur } from './erreurs';
import {
  calculerFiche,
  type EntreeFiche,
  type SalaireEmploye,
  type SalaireOuvrier,
  type VersionAvecParametres,
} from './fiche';
import type { SituationFiscalePaie } from './precompte';
import type { Centimes, DateIso } from './types';

// CAS DE RÉFÉRENCE (modules/paie.md § 5 et 6, étape 9.4, D118).
//
// Un cas de référence est une fiche dont les montants viennent d'une SOURCE EXTERNE (simulateur, fiche
// d'un secrétariat social), jamais du moteur ni de l'assistant. Rejouer ces cas contre une version de
// barème prouve que cette version redonne les mêmes montants au centime : « un barème n'est jamais
// activé si un cas de référence échoue » (D22). C'est une fonction pure : le SuperAdmin et le
// garde-fou d'activation (étape 9.5) peuvent l'appeler sans base de données.
//
// Les montants du tableau viennent de doc/reference/cas-de-reference-simulations.md (simulations du
// 30/10/2026 sur calculateur-de-salaire.be, source secondaire). Un champ absent de `attendu` n'est pas
// contrôlé : c'est le cas du cas 8 (ouvrier), où le site s'écarte des textes officiels sur la CSSS
// (108 %) et sur l'arrondi du bonus fiscal ; ces lignes ont un test à part, calculé à la main sur les
// textes officiels (cas-reference.test.ts), et ne sont PAS présentées comme une simulation externe.

// Les montants contrôlés, tous en centimes, dans le vocabulaire du simulateur.
export interface AttenduCas {
  onssPersonnelle?: Centimes;
  bonusEmploi?: Centimes; // bonus à l'emploi social, volets A et B
  imposable?: Centimes;
  // « Précompte barémique » du simulateur moins les réductions de famille : le précompte avant bonus.
  precompteAvantBonus?: Centimes;
  bonusFiscal?: Centimes; // bonus à l'emploi fiscal, déduit du précompte
  reductionsFamille?: Centimes; // réductions mensuelles pour charges de famille
  precompte?: Centimes;
  cotisationSpeciale?: Centimes; // CSSS
  net?: Centimes;
}

export interface CasReference {
  id: string;
  description: string;
  source: string; // d'où viennent les valeurs attendues
  periode: { annee: number; mois: number };
  datePaiement: DateIso;
  entree: Omit<EntreeFiche, 'versions' | 'periode' | 'datePaiement' | 'categorieEmployeur'>;
  attendu: AttenduCas;
}

export interface EcartCas {
  casId: string;
  champ: string;
  attendu: Centimes | string;
  obtenu: Centimes | string;
}

export interface ResultatCasReference {
  casVerifies: number;
  ecarts: EcartCas[];
}

// ---------------------------------------------------------------------------------------------
// Les cas du 30/10/2026
// ---------------------------------------------------------------------------------------------

const SOURCE =
  'Simulation externe du 30/10/2026, calculateur-de-salaire.be (doc/reference/cas-de-reference-simulations.md)';

const isole: SituationFiscalePaie = {
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
};

const marie: SituationFiscalePaie = {
  ...isole,
  situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL',
  conjointRevenus: 'SANS_REVENUS',
};

const employe = (euros: number): SalaireEmploye => ({
  statut: 'EMPLOYE',
  remunerationMensuelle: euros * 100,
  absenceNonRemDemiJours: 0,
  joursReferenceMois: null,
  primeCents: null,
  primeLibelle: null,
});

// Ouvrier à 25,00 €/h pendant 100 heures = 2 500,00 €.
const ouvrier2500: SalaireOuvrier = {
  statut: 'OUVRIER',
  tauxHoraire: 2_500,
  heuresPresteesMinutes: 6_000,
  primeCents: null,
  primeLibelle: null,
};

// Octobre = 1er mois du trimestre pour la CSSS : aucun cumul des mois précédents.
const entree = (
  salaire: SalaireEmploye | SalaireOuvrier,
  situation: SituationFiscalePaie,
): CasReference['entree'] => ({
  salaire,
  prestations: { unite: 'JOURS', realisees: 20, pleinTemps: 20 },
  occupation: { regime: 'TEMPS_PLEIN', heuresSemaineMinutes: null, heuresReferenceMinutes: null },
  situation,
  habitantRoyaume: true,
  employeurDixTravailleursOuPlus: false,
  cumuls: {
    bonusDejaPrisAnneeCentimes: 0,
    brutMoisPrecedentsCentimes: 0,
    csssDejaRetenueCentimes: 0,
    netMoisPrecedentCentimes: null,
  },
});

const octobre = { periode: { annee: 2026, mois: 10 }, datePaiement: '2026-10-30' } as const;

export const CAS_REFERENCE_2026: readonly CasReference[] = [
  {
    id: 'CAS-1',
    description: 'Employé isolé, 2 000,00 €',
    source: SOURCE,
    ...octobre,
    entree: entree(employe(2000), isole),
    attendu: {
      onssPersonnelle: 26_140,
      bonusEmploi: 26_140,
      imposable: 200_000,
      precompteAvantBonus: 16_701, // précompte barémique 167,01
      bonusFiscal: 12_660,
      reductionsFamille: 0,
      precompte: 4_041,
      cotisationSpeciale: 230,
      net: 195_729,
    },
  },
  {
    id: 'CAS-2',
    description: 'Employé isolé, 2 800,00 €',
    source: SOURCE,
    ...octobre,
    entree: entree(employe(2800), isole),
    attendu: {
      onssPersonnelle: 36_596,
      bonusEmploi: 16_475,
      imposable: 259_879,
      precompteAvantBonus: 42_329, // 423,29
      bonusFiscal: 6_571,
      reductionsFamille: 0,
      precompte: 35_758,
      cotisationSpeciale: 1_704,
      net: 222_417,
    },
  },
  {
    id: 'CAS-3',
    description: 'Employé isolé, 4 500,00 € (aucun bonus)',
    source: SOURCE,
    ...octobre,
    entree: entree(employe(4500), isole),
    attendu: {
      onssPersonnelle: 58_815,
      bonusEmploi: 0,
      imposable: 391_185,
      precompteAvantBonus: 103_598, // 1 035,98
      bonusFiscal: 0,
      reductionsFamille: 0,
      precompte: 103_598,
      cotisationSpeciale: 4_401,
      net: 283_186,
    },
  },
  {
    id: 'CAS-4',
    description: 'Employé isolé avec un enfant, 2 800,00 €',
    source: SOURCE,
    ...octobre,
    entree: entree(employe(2800), { ...isole, enfantsCharge: 1, parentIsole: true }),
    attendu: {
      onssPersonnelle: 36_596,
      bonusEmploi: 16_475,
      imposable: 259_879,
      precompteAvantBonus: 31_929, // 423,29 - 104,00 (enfant 52,00 + parent isolé 52,00)
      bonusFiscal: 6_571,
      reductionsFamille: 10_400,
      precompte: 25_358,
      cotisationSpeciale: 1_704,
      net: 232_817,
    },
  },
  {
    id: 'CAS-5',
    description: 'Employé isolé avec trois enfants, 2 800,00 €',
    source: SOURCE,
    ...octobre,
    entree: entree(employe(2800), { ...isole, enfantsCharge: 3, parentIsole: true }),
    attendu: {
      precompteAvantBonus: 429, // 423,29 - 419,00 (enfants 367,00 + parent isolé 52,00)
      reductionsFamille: 41_900,
      precompte: 0,
      cotisationSpeciale: 1_704,
      net: 258_175,
    },
  },
  {
    id: 'CAS-6',
    description: 'Employé marié, conjoint sans revenus, 2 800,00 €',
    source: SOURCE,
    ...octobre,
    entree: entree(employe(2800), marie),
    attendu: {
      precompteAvantBonus: 7_352, // 73,52
      bonusFiscal: 6_571,
      reductionsFamille: 0,
      precompte: 781,
      cotisationSpeciale: 2_115,
      net: 256_983,
    },
  },
  {
    id: 'CAS-7',
    description: 'Employé marié avec deux enfants, 2 800,00 €',
    source: SOURCE,
    ...octobre,
    entree: entree(employe(2800), { ...marie, enfantsCharge: 2 }),
    attendu: {
      reductionsFamille: 13_800,
      precompte: 0,
      cotisationSpeciale: 2_115,
      net: 257_764,
    },
  },
  {
    id: 'CAS-8',
    description:
      'Ouvrier isolé, 2 500,00 € (lignes où la simulation et les textes officiels concordent)',
    source: SOURCE,
    ...octobre,
    entree: entree(ouvrier2500, isole),
    attendu: {
      onssPersonnelle: 35_289,
      bonusEmploi: 26_537,
      imposable: 241_248,
      precompteAvantBonus: 34_355, // 343,55
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Rejouer les cas
// ---------------------------------------------------------------------------------------------

const CATEGORIE = 'PRIVE_MARCHAND';

// Les cas qui tombent entièrement dans la validité d'une version : c'est eux qui la valident. Une
// version sans aucun cas ne peut pas être validée (étape 9.5).
export function casDeLaVersion(
  version: { valideDepuis: DateIso; valideJusqua: DateIso | null },
  cas: readonly CasReference[] = CAS_REFERENCE_2026,
): CasReference[] {
  return cas.filter((c) => {
    const mois = String(c.periode.mois).padStart(2, '0');
    const premier = `${c.periode.annee}-${mois}-01`;
    const dernier = `${c.periode.annee}-${mois}-${String(joursDuMois(c.periode.annee, c.periode.mois)).padStart(2, '0')}`;
    return (
      version.valideDepuis <= premier &&
      (version.valideJusqua === null || version.valideJusqua >= dernier)
    );
  });
}

// Rejoue chaque cas avec `calculerFiche` sur les versions données et renvoie tous les écarts avec
// les valeurs attendues. Un cas dont le calcul échoue (barème introuvable, bloc manquant...) donne un
// écart « calcul » plutôt qu'une exception : l'appelant voit tout ce qui ne va pas d'un coup.
export function verifierCasReference(
  versions: readonly VersionAvecParametres[],
  cas: readonly CasReference[] = CAS_REFERENCE_2026,
): ResultatCasReference {
  const ecarts: EcartCas[] = [];
  for (const c of cas) {
    let r;
    try {
      r = calculerFiche({
        ...c.entree,
        periode: c.periode,
        datePaiement: c.datePaiement,
        categorieEmployeur: CATEGORIE,
        versions,
      });
    } catch (e) {
      if (!(e instanceof ErreurMoteur)) throw e;
      ecarts.push({ casId: c.id, champ: 'calcul', attendu: 'un résultat', obtenu: e.code });
      continue;
    }
    const obtenu: Required<AttenduCas> = {
      onssPersonnelle: r.onssPersonnelle,
      bonusEmploi: r.bonusEmploi,
      imposable: r.imposable,
      precompteAvantBonus: r.detailPrecompte.precompteAvantBonus,
      bonusFiscal: r.detailPrecompte.reductionBonusEmploi,
      // Les réductions de famille du détail sont annuelles : le simulateur les donne par mois.
      reductionsFamille: arrondirFraction(r.detailPrecompte.reductionsFamille, 12),
      precompte: r.precompte,
      cotisationSpeciale: r.cotisationSpeciale,
      net: r.net,
    };
    for (const champ of Object.keys(c.attendu) as (keyof AttenduCas)[]) {
      const attendu = c.attendu[champ];
      if (attendu !== undefined && attendu !== obtenu[champ]) {
        ecarts.push({ casId: c.id, champ, attendu, obtenu: obtenu[champ] });
      }
    }
  }
  return { casVerifies: cas.length, ecarts };
}
