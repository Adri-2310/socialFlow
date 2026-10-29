import type {
  ParametresBonusEmploi,
  ParametresCotisationsPatronales,
  ParametresCsss,
  ParametresOnss,
  ParametresPrecompte,
  ParametresReductionStructurelle,
} from '@/lib/payroll/bareme/schema';

// Paramètres de TEST, recopiés à la main du document officiel (pas calculés par le moteur) :
// Instructions administratives ONSS, édition 2026/3.
//   - cotisation personnelle : p. 175 (13,07 %) ; base ouvrier : p. 176 (108 %) ;
//   - bonus à l'emploi, tableaux « à partir du 1er septembre 2026 » : p. 451-452 ;
//   - plafond annuel : p. 453 (3 594,36 € depuis le 1er juillet 2026).
// Les montants sont en centimes, les taux en dix-millièmes de pour cent (100 % = 1 000 000).

export const ONSS_2026_09: ParametresOnss = {
  tauxPersonnel: 130_700, // 13,07 %
  coefficientOuvrier: 1_080_000, // 108 %
};

export const BONUS_EMPLOI_2026_09: ParametresBonusEmploi = {
  employe: {
    voletA: {
      montantMax: 12_754,
      plafondPlein: 293_793,
      coefficient: 273_900,
      plafondNul: 340_362,
    },
    voletB: {
      montantMax: 17_199,
      plafondPlein: 230_062,
      coefficient: 269_900,
      plafondNul: 293_793,
    },
  },
  ouvrier: {
    voletA: {
      montantMax: 13_774,
      plafondPlein: 293_793,
      coefficient: 295_800,
      plafondNul: 340_362,
    },
    voletB: {
      montantMax: 18_575,
      plafondPlein: 230_062,
      coefficient: 291_500,
      plafondNul: 293_793,
    },
  },
  plafondAnnuel: 359_436,
};

// Annexe III à l'AR/CIR 92 (revenus payés à partir du 01/01/2026) :
// n° 28 (frais), 31 (barème), 32 (quotité), 34 (quotient conjugal), 38 à 41 (réductions), 46 (bonus).
export const PRECOMPTE_2026: ParametresPrecompte = {
  fraisProfessionnels: { taux: 300_000, maximum: 607_000 }, // 30 %, 6 070 €
  bareme: [
    { auDela: 0, impotFixe: 0, taux: 267_500 }, // 26,75 %
    { auDela: 1_671_000, impotFixe: 446_993, taux: 428_000 }, // 16 710 € : 4 469,93 + 42,80 %
    { auDela: 2_950_000, impotFixe: 994_405, taux: 481_500 }, // 29 500 € : 9 944,05 + 48,15 %
    { auDela: 5_105_000, impotFixe: 2_032_038, taux: 535_000 }, // 51 050 € : 20 320,38 + 53,50 %
  ],
  impotQuotiteExemptee: 298_798, // 2 987,98 €
  quotientConjugal: { taux: 300_000, maximum: 1_379_000 }, // 30 %, 13 790 €
  reductions: {
    enfants: [62_400, 165_600, 440_400, 762_000, 1_110_000, 1_459_200, 1_812_000, 2_199_600],
    parEnfantAuDela8: 386_400,
    beneficiaireHandicape: 62_400,
    dependant66: 199_200,
    autreCharge: 62_400,
    parentIsole: 62_400,
    conjointRevenuLimite: 174_000,
    conjointPensionLimitee: 347_400,
    conjointHandicape: 62_400,
  },
  bonusEmploiFiscal: { tauxVoletA: 331_400, tauxVoletB: 525_400 }, // 33,14 %, 52,54 %
};

// Cotisation spéciale pour la sécurité sociale : Instructions administratives ONSS 2026/3,
// « La cotisation spéciale pour la sécurité sociale » (barèmes depuis le 01/04/2022).
// Montants par TRIMESTRE. Les seuils « >= x » du document restent tels quels ; « > x » s'écrit
// « >= x + 0,01 € » (6 570,54 € devient 657 055 centimes).
export const CSSS_2026_3: ParametresCsss = {
  coefficientOuvrier: 1_080_000, // 108 %
  individuelle: [
    { depuis: 583_614, fixe: 0, excedentDe: 583_614, taux: 42_200 }, // 5 836,14 : 4,22 %
    { depuis: 657_055, fixe: 3_099, excedentDe: 657_054, taux: 11_000 }, // 30,99 + 1,10 %
    { depuis: 1_121_101, fixe: 8_205, excedentDe: 1_121_100, taux: 33_800 }, // 82,05 + 3,38 %
    { depuis: 1_230_001, fixe: 11_883, excedentDe: 1_230_000, taux: 11_000 }, // 118,83 + 1,10 %
    { depuis: 1_811_647, fixe: 18_282, excedentDe: 0, taux: 0 }, // 182,82 fixe
  ],
  communeConjointRevenus: [
    { depuis: 328_529, fixe: 1_545, excedentDe: 0, taux: 0 }, // 3 285,29 : 15,45
    { depuis: 583_614, fixe: 0, excedentDe: 583_614, taux: 59_000, plancher: 1_545 }, // 5,90 %
    { depuis: 657_055, fixe: 4_332, excedentDe: 657_054, taux: 11_000, plafond: 15_492 },
  ],
  communeConjointSansRevenus: [
    { depuis: 583_614, fixe: 0, excedentDe: 583_614, taux: 59_000 }, // 5,90 %
    { depuis: 657_055, fixe: 4_332, excedentDe: 657_054, taux: 11_000, plafond: 18_282 },
  ],
};

// Cotisations patronales : Instructions administratives ONSS 2026/3, pages 174 à 177 (taux de
// base 19,88 %, modération 4,27 %, vacances ouvriers 5,57 % + 10,27 %, cotisation de 1,60 %) et
// cotisations spéciales Fonds amiante (0,01 %) et accidents du travail (0,02 %).
export const COTISATIONS_PATRONALES_2026_3: ParametresCotisationsPatronales = {
  tauxBase: 198_800, // 19,88 %
  coefficientOuvrier: 1_080_000, // 108 %
  moderation: 42_700, // 4,27 %
  vacancesOuvrier: { trimestrielle: 55_700, avisDebit: 102_700 }, // 5,57 % et 10,27 %
  fondsAmiante: 100, // 0,01 %
  accidentsTravailSpecial: 200, // 0,02 %
  dixTravailleurs: 16_000, // 1,60 %
};

// Réduction structurelle, catégorie 1, à partir du 3e trimestre 2026 : pages 374 à 383.
export const REDUCTION_STRUCTURELLE_2026_3: ParametresReductionStructurelle = {
  plafondBasSalaires: 1_168_774, // S0 : 11 687,74 €
  coefficientBasSalaires: 140_000, // 0,1400
  plafondTresBasSalaires: 973_814, // S2 : 9 738,14 €
  coefficientTresBasSalaires: 160_000, // 0,1600
  plancherPrestations: 275_000, // 0,275
  debutProgression: 550_000, // 0,55
  finProgression: 800_000, // 0,80
  valeurMinimale: 1_180_000, // 1,18
  pente: 280_000, // 0,28
};
