import type { ParametresBonusEmploi, ParametresOnss } from '@/lib/payroll/bareme/schema';

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
