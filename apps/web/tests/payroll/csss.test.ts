// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  calculerCsss,
  calculerMontantTrimestre,
  type EntreeCsss,
  type SituationCsss,
} from '@/lib/payroll/csss';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import { CSSS_2026_3 as BLOC } from './fixtures-bareme';

// Valeurs attendues calculées à la main à partir du document ONSS 2026/3 (calcul en commentaire).
// Montants en centimes : 51,11 € s'écrit 5 111. Q = rémunération du trimestre.

const isole: SituationCsss = { situationFamiliale: 'ISOLE', conjointRevenus: null };
const marie = (conjointRevenus: SituationCsss['conjointRevenus']): SituationCsss => ({
  situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL',
  conjointRevenus,
});

const entree = (surcharge: Partial<EntreeCsss>): EntreeCsss => ({
  categorie: 'EMPLOYE',
  brutCentimes: 280_000,
  moisCivil: 7,
  situation: isole,
  brutMoisPrecedentsCentimes: 0,
  csssDejaRetenueCentimes: 0,
  ...surcharge,
});

describe('calculerMontantTrimestre : imposition individuelle', () => {
  const m = (q: number) => calculerMontantTrimestre(q, BLOC.individuelle);

  it('ne retient rien jusqu’à 5 836,14 €', () => {
    expect(m(0)).toBe(0);
    expect(m(583_613)).toBe(0);
    expect(m(583_614)).toBe(0);
  });

  it('retrouve les montants imprimés aux sommets des tranches', () => {
    // 4,22 % x (6 570,54 - 5 836,14 = 734,40) = 30,9917 -> 30,99 : le montant fixe du document.
    expect(m(657_054)).toBe(3_099);
    // Dernière tranche : 182,82 fixe.
    expect(m(1_811_647)).toBe(18_282);
    expect(m(2_000_000)).toBe(18_282);
  });

  it('calcule à l’intérieur de chaque tranche', () => {
    // 8 400,00 : 30,99 + 1,10 % x (8 400,00 - 6 570,54 = 1 829,46) = 30,99 + 20,12 = 51,11
    expect(m(840_000)).toBe(5_111);
    // 10 000,00 : 30,99 + 1,10 % x 3 429,46 = 37,7241 -> 37,72 -> 68,71
    expect(m(1_000_000)).toBe(6_871);
    // 11 500,00 : 82,05 + 3,38 % x (11 500 - 11 211 = 289) = 9,7682 -> 9,77 -> 91,82
    expect(m(1_150_000)).toBe(9_182);
    // 15 000,00 : 118,83 + 1,10 % x (15 000 - 12 300 = 2 700) = 29,70 -> 148,53
    expect(m(1_500_000)).toBe(14_853);
  });

  it('montre l’écart d’arrondi du document entre 12 300,00 € et 12 300,01 €', () => {
    // Le document imprime 118,83 € au début de la dernière tranche, alors que la tranche
    // précédente atteint 82,05 + 3,38 % x 1 089 = 118,86 € à 12 300,00 € (3 centimes d'écart).
    expect(m(1_230_000)).toBe(11_886);
    expect(m(1_230_001)).toBe(11_883);
  });
});

describe('calculerMontantTrimestre : imposition commune', () => {
  const avec = (q: number) => calculerMontantTrimestre(q, BLOC.communeConjointRevenus);
  const sans = (q: number) => calculerMontantTrimestre(q, BLOC.communeConjointSansRevenus);

  it('conjoint avec revenus : palier de 15,45 € dès 3 285,29 €', () => {
    expect(avec(328_528)).toBe(0);
    expect(avec(328_529)).toBe(1_545);
    expect(avec(583_613)).toBe(1_545);
  });

  it('conjoint avec revenus : minimum de 15,45 € dans la tranche à 5,90 %', () => {
    // 6 000,00 : 5,90 % x (6 000 - 5 836,14 = 163,86) = 9,6677 -> 9,67 < 15,45 -> 15,45
    expect(avec(600_000)).toBe(1_545);
    // 6 500,00 : 5,90 % x 663,86 = 39,1677 -> 39,17 (au-dessus du minimum)
    expect(avec(650_000)).toBe(3_917);
  });

  it('conjoint avec revenus : 43,32 € + 1,10 %, plafonné à 154,92 €', () => {
    // 7 500,00 : 43,32 + 1,10 % x (7 500 - 6 570,54 = 929,46) = 10,2241 -> 10,22 -> 53,54
    expect(avec(750_000)).toBe(5_354);
    // 30 000,00 : 43,32 + 1,10 % x 23 429,46 = 257,72 -> 301,04 -> plafond 154,92
    expect(avec(3_000_000)).toBe(15_492);
  });

  it('conjoint sans revenus : rien avant 5 836,14 €, puis plafond à 182,82 €', () => {
    expect(sans(583_613)).toBe(0);
    expect(sans(650_000)).toBe(3_917);
    expect(sans(750_000)).toBe(5_354);
    // 20 000,00 : 43,32 + 1,10 % x 13 429,46 = 147,72 -> 191,04 -> plafond 182,82
    expect(sans(2_000_000)).toBe(18_282);
  });

  it('montre le dernier centime de la tranche à 5,90 %', () => {
    // 5,90 % x 734,40 = 43,3296 -> 43,33 à 6 570,54 €, puis 43,32 € dès 6 570,55 €.
    expect(avec(657_054)).toBe(4_333);
    expect(avec(657_055)).toBe(4_332);
  });
});

describe('calculerCsss : mois 1 et 2 (provision d’un tiers)', () => {
  it('isolé à 2 800 € : 17,04 € par mois', () => {
    // Q = 3 x 2 800 = 8 400,00 -> 51,11 ; tiers = 17,0366 -> 17,04
    const r = calculerCsss(entree({}), BLOC);
    expect(r.rang).toBe(1);
    expect(r.remunerationTrimestre).toBe(840_000);
    expect(r.montantTrimestre).toBe(5_111);
    expect(r.retenue).toBe(1_704);
    expect(r.lignes).toEqual([
      {
        code: 'CSSS',
        libelle: 'Cotisation spéciale de sécurité sociale (provision)',
        base: 840_000,
        taux: null,
        montant: -1_704,
      },
    ]);
    expect(calculerCsss(entree({ moisCivil: 8 }), BLOC).rang).toBe(2);
  });

  it('retrouve les montants mensuels du document (conjoint avec revenus)', () => {
    // Le document : 5,15 € entre 1 095,10 € et 1 945,38 € ; 14,44 € + 1,1 % au-delà de 2 190,18 €.
    const avec = marie('REVENUS');
    // 1 100,00 : Q = 3 300,00 >= 3 285,29 -> 15,45 ; tiers = 5,15
    expect(calculerCsss(entree({ situation: avec, brutCentimes: 110_000 }), BLOC).retenue).toBe(
      515,
    );
    // 2 300,00 : Q = 6 900,00 -> 43,32 + 1,10 % x 329,46 = 3,6241 -> 3,62 -> 46,94 ;
    // tiers = 15,6467 -> 15,65 (document : 14,44 + 1,1 % x (2 300 - 2 190,18) = 15,65)
    expect(calculerCsss(entree({ situation: avec, brutCentimes: 230_000 }), BLOC).retenue).toBe(
      1_565,
    );
    // 10 000,00 : plafond 154,92 ; tiers = 51,64 (le maximum mensuel du document)
    expect(calculerCsss(entree({ situation: avec, brutCentimes: 1_000_000 }), BLOC).retenue).toBe(
      5_164,
    );
  });

  it('ne retient rien sous le seuil et n’écrit alors aucune ligne', () => {
    // 900,00 : Q = 2 700,00 < 3 285,29
    const r = calculerCsss(entree({ situation: marie('REVENUS'), brutCentimes: 90_000 }), BLOC);
    expect(r.retenue).toBe(0);
    expect(r.lignes).toEqual([]);
  });

  it('prend le barème « sans revenus » pour les quatre autres situations du conjoint', () => {
    // 2 500,00 : Q = 7 500,00 -> 53,54 ; tiers = 17,8467 -> 17,85
    for (const c of [
      'SANS_REVENUS',
      'PENSION_TRES_LIMITEE',
      'PENSION_LIMITEE',
      'REVENU_LIMITE',
    ] as const) {
      const r = calculerCsss(entree({ situation: marie(c), brutCentimes: 250_000 }), BLOC);
      expect(r.retenue).toBe(1_785);
    }
    // L'isolé du même salaire : 30,99 + 1,10 % x (7 500 - 6 570,54) = 41,21 ; tiers = 13,7367 -> 13,74
    expect(calculerCsss(entree({ brutCentimes: 250_000 }), BLOC).retenue).toBe(1_374);
  });

  it('majore le salaire d’un ouvrier de 8 %', () => {
    // 2 000,00 x 108 % = 2 160,00 ; Q = 6 480,00 ; 4,22 % x (6 480 - 5 836,14 = 643,86) = 27,1709
    // -> 27,17 ; tiers = 9,0567 -> 9,06
    const r = calculerCsss(entree({ categorie: 'OUVRIER', brutCentimes: 200_000 }), BLOC);
    expect(r.remunerationTrimestre).toBe(648_000);
    expect(r.montantTrimestre).toBe(2_717);
    expect(r.retenue).toBe(906);
  });
});

describe('calculerCsss : mois 3 (solde du trimestre)', () => {
  it('retient la différence avec ce qui l’a déjà été', () => {
    // Q réel = 8 400,00 -> 51,11 ; déjà retenu 2 x 17,04 = 34,08 -> 17,03
    const r = calculerCsss(
      entree({
        moisCivil: 9,
        brutMoisPrecedentsCentimes: 560_000,
        csssDejaRetenueCentimes: 3_408,
      }),
      BLOC,
    );
    expect(r.rang).toBe(3);
    expect(r.remunerationTrimestre).toBe(840_000);
    expect(r.retenue).toBe(1_703);
    expect(r.lignes[0]).toMatchObject({
      libelle: 'Cotisation spéciale de sécurité sociale (solde du trimestre)',
      montant: -1_703,
    });
  });

  it('applique le salaire réel : un trimestre irrégulier change le montant', () => {
    // Deux mois à 2 000 (provision : Q = 6 000 -> 4,22 % x 163,86 = 6,91 -> 2,30 par mois),
    // puis 4 000 le 3e mois : Q = 8 000,00 -> 30,99 + 1,10 % x 1 429,46 = 15,72 -> 46,71.
    // Déjà retenu : 2 x 2,30 = 4,60 -> 42,11 à retenir.
    const r = calculerCsss(
      entree({
        moisCivil: 12,
        brutCentimes: 400_000,
        brutMoisPrecedentsCentimes: 400_000,
        csssDejaRetenueCentimes: 460,
      }),
      BLOC,
    );
    expect(r.montantTrimestre).toBe(4_671);
    expect(r.retenue).toBe(4_211);
  });

  it('rembourse le trop retenu', () => {
    // Deux mois à 2 800 (34,08 retenus), puis aucun salaire : Q = 5 600,00 < 5 836,14 -> 0
    const r = calculerCsss(
      entree({
        moisCivil: 12,
        brutCentimes: 0,
        brutMoisPrecedentsCentimes: 560_000,
        csssDejaRetenueCentimes: 3_408,
      }),
      BLOC,
    );
    expect(r.retenue).toBe(-3_408);
    expect(r.lignes).toEqual([
      {
        code: 'CSSS',
        libelle: 'Cotisation spéciale de sécurité sociale (remboursement du trop retenu)',
        base: 560_000,
        taux: null,
        montant: 3_408,
      },
    ]);
  });

  it('majore le trimestre d’un ouvrier une seule fois, sur le total', () => {
    // 3 x 2 000 = 6 000 x 108 % = 6 480 : 27,17 ; déjà 2 x 9,06 = 18,12 -> 9,05
    const r = calculerCsss(
      entree({
        categorie: 'OUVRIER',
        moisCivil: 3,
        brutCentimes: 200_000,
        brutMoisPrecedentsCentimes: 400_000,
        csssDejaRetenueCentimes: 1_812,
      }),
      BLOC,
    );
    expect(r.remunerationTrimestre).toBe(648_000);
    expect(r.retenue).toBe(905);
  });

  it('n’écrit aucune ligne quand il n’y a rien à régulariser', () => {
    const r = calculerCsss(entree({ moisCivil: 6, brutCentimes: 0 }), BLOC);
    expect(r.retenue).toBe(0);
    expect(r.lignes).toEqual([]);
  });
});

describe('calculerCsss : rang dans le trimestre', () => {
  it('se déduit du mois civil', () => {
    const rangs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(
      (moisCivil) => calculerCsss(entree({ moisCivil }), BLOC).rang,
    );
    expect(rangs).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3]);
  });
});

describe('calculerCsss : entrées refusées', () => {
  const refus = (surcharge: Partial<EntreeCsss>) => {
    try {
      calculerCsss(entree(surcharge), BLOC);
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurMoteur);
      return (e as ErreurMoteur).code;
    }
    return null;
  };

  it('refuse un mois hors 1 à 12 ou non entier', () => {
    expect(refus({ moisCivil: 0 })).toBe('ENTREE_INVALIDE');
    expect(refus({ moisCivil: 13 })).toBe('ENTREE_INVALIDE');
    expect(refus({ moisCivil: 1.5 })).toBe('ENTREE_INVALIDE');
  });

  it('refuse un montant décimal ou négatif', () => {
    expect(refus({ brutCentimes: 100.5 })).toBe('ENTREE_INVALIDE');
    expect(refus({ brutMoisPrecedentsCentimes: -1 })).toBe('ENTREE_INVALIDE');
    expect(refus({ csssDejaRetenueCentimes: 0.5 })).toBe('ENTREE_INVALIDE');
  });

  it('refuse un statut inconnu', () => {
    expect(refus({ categorie: 'CADRE' as never })).toBe('ENTREE_INVALIDE');
  });

  it('refuse un salarié marié dont les revenus du conjoint ne sont pas précisés', () => {
    expect(refus({ situation: marie(null) })).toBe('ENTREE_INVALIDE');
  });

  it('refuse une situation familiale inconnue', () => {
    expect(
      refus({ situation: { situationFamiliale: 'VEUF' as never, conjointRevenus: null } }),
    ).toBe('ENTREE_INVALIDE');
  });
});
