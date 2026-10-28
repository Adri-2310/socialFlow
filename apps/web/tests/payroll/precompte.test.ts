// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import {
  calculerFraisProfessionnels,
  calculerImpotDeBase,
  calculerImpotSelonBareme,
  calculerPrecompte,
  calculerReductionEnfants,
  type EntreePrecompte,
  type SituationFiscalePaie,
} from '@/lib/payroll/precompte';
import { PRECOMPTE_2026 as BLOC } from './fixtures-bareme';

// Toutes les valeurs attendues sont calculées à la main à partir de l'Annexe III 2026 (le calcul
// est détaillé en commentaire). Montants en centimes : 2 800,00 € s'écrit 280 000.

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
const marie = (conjointRevenus: SituationFiscalePaie['conjointRevenus']): SituationFiscalePaie => ({
  ...isole,
  situationFamiliale: 'MARIE_OU_COHABITANT_LEGAL',
  conjointRevenus,
});

// Salaire de 2 800,00 € : cotisation 365,96 ; bonus volet A 127,54 et volet B 37,21.
const entree2800: EntreePrecompte = {
  brutCentimes: 280_000,
  cotisationPersonnelleCentimes: 36_596,
  bonusVoletACentimes: 12_754,
  bonusVoletBCentimes: 3_721,
  situation: isole,
  habitantRoyaume: true,
};
// Salaire de 4 000,00 € : cotisation 522,80 ; pas de bonus (au-dessus du plafond).
const entree4000: EntreePrecompte = {
  brutCentimes: 400_000,
  cotisationPersonnelleCentimes: 52_280,
  bonusVoletACentimes: 0,
  bonusVoletBCentimes: 0,
  situation: isole,
  habitantRoyaume: true,
};

describe('calculerImpotSelonBareme (n° 31)', () => {
  it('retrouve les montants fixes du document à chaque seuil', () => {
    expect(calculerImpotSelonBareme(0, BLOC)).toBe(0);
    // 16 710,00 x 26,75 % = 4 469,925 -> 4 469,93
    expect(calculerImpotSelonBareme(1_671_000, BLOC)).toBe(446_993);
    // 4 469,93 + 42,80 % x (29 500 - 16 710) = 4 469,93 + 5 474,12 = 9 944,05
    expect(calculerImpotSelonBareme(2_950_000, BLOC)).toBe(994_405);
    // 9 944,05 + 48,15 % x (51 050 - 29 500) = 9 944,05 + 10 376,325 -> 20 320,38
    expect(calculerImpotSelonBareme(5_105_000, BLOC)).toBe(2_032_038);
  });

  it("applique le taux de la tranche à l'excédent", () => {
    expect(calculerImpotSelonBareme(1_000_000, BLOC)).toBe(267_500); // 10 000 x 26,75 %
    // 20 320,38 + 53,50 % x (60 000 - 51 050) = 20 320,38 + 4 788,25 = 25 108,63
    expect(calculerImpotSelonBareme(6_000_000, BLOC)).toBe(2_510_863);
  });
});

describe('calculerFraisProfessionnels (n° 28)', () => {
  it('30 % sous le plafond, 6 070 € au-delà', () => {
    expect(calculerFraisProfessionnels(1_500_000, BLOC)).toBe(450_000); // 30 % de 15 000 €
    expect(calculerFraisProfessionnels(2_023_333, BLOC)).toBe(607_000); // seuil du document : 30 % = 6 069,999
    expect(calculerFraisProfessionnels(3_118_548, BLOC)).toBe(607_000); // 30 % = 9 355,64 -> plafond
  });
});

describe('calculerImpotDeBase (n° 32 et 34)', () => {
  it('isolé : barème moins la quotité exemptée', () => {
    // Net 25 115,48 : 8 067,48 - 2 987,98 = 5 079,50
    expect(calculerImpotDeBase(2_511_548, isole, BLOC)).toBe(507_950);
  });

  it('conjoint sans revenus : quotient conjugal', () => {
    // Imputé : 30 % de 25 115,48 = 7 534,644 -> 7 534,64 ; impôt 26,75 % = 2 015,5162 -> 2 015,52
    // Reste 17 580,84 : 4 469,93 + 42,80 % x 870,84 = 4 469,93 + 372,72 = 4 842,65
    // 2 015,52 + 4 842,65 - 5 975,96 = 882,21
    expect(calculerImpotDeBase(2_511_548, marie('SANS_REVENUS'), BLOC)).toBe(88_221);
    // Une pension très limitée est traitée comme l'absence de revenus (n° 33).
    expect(calculerImpotDeBase(2_511_548, marie('PENSION_TRES_LIMITEE'), BLOC)).toBe(88_221);
  });

  it('quotient conjugal plafonné à 13 790 € imputés', () => {
    // Net 50 000 € : 30 % = 15 000 > 13 790 -> imputé 13 790.
    // 13 790 x 26,75 % = 3 688,825 -> 3 688,83 ; reste 36 210 : 9 944,05 + 48,15 % x 6 710 = 9 944,05 + 3 230,865 -> 13 174,92
    // 3 688,83 + 13 174,92 - 5 975,96 = 10 887,79
    expect(calculerImpotDeBase(5_000_000, marie('SANS_REVENUS'), BLOC)).toBe(1_088_779);
  });

  it('conjoint avec revenus : comme un isolé', () => {
    expect(calculerImpotDeBase(2_511_548, marie('REVENUS'), BLOC)).toBe(507_950);
  });
});

describe('calculerReductionEnfants (n° 38 et 8)', () => {
  it("lit le tableau jusqu'à 8 enfants", () => {
    expect(calculerReductionEnfants(0, BLOC)).toBe(0);
    expect(calculerReductionEnfants(1, BLOC)).toBe(62_400);
    expect(calculerReductionEnfants(3, BLOC)).toBe(440_400);
    expect(calculerReductionEnfants(8, BLOC)).toBe(2_199_600);
  });

  it('ajoute 3 864 € par enfant au-delà du huitième (exemples du document)', () => {
    expect(calculerReductionEnfants(9, BLOC)).toBe(2_586_000); // 25 860 €
    expect(calculerReductionEnfants(10, BLOC)).toBe(2_972_400); // 29 724 €
  });
});

describe('calculerPrecompte : cas complets', () => {
  it('isolé, 2 800,00 € : exemple du plan', () => {
    // a) retenue 365,96 - 164,75 = 201,21 ; base 2 598,79       b) x 12 = 31 185,48 ; frais 6 070,00 ; net 25 115,48
    // c) 5 079,50    d) 0    e) 5 079,50 / 12 = 423,2917 -> 423,29
    // f) 33,14 % x 127,54 = 42,2668 -> 42,27 ; 52,54 % x 37,21 = 19,5501 -> 19,55 ; total 61,82
    // précompte 423,29 - 61,82 = 361,47
    const r = calculerPrecompte(entree2800, BLOC);
    expect(r.detail).toEqual({
      baseMensuelle: 259_879,
      baseAnnuelle: 3_118_548,
      fraisProfessionnels: 607_000,
      baseNetteAnnuelle: 2_511_548,
      impotDeBase: 507_950,
      reductionsFamille: 0,
      precompteAvantBonus: 42_329,
      reductionBonusEmploi: 6_182,
    });
    expect(r.precompte).toBe(36_147);
    expect(r.lignes).toEqual([
      {
        code: 'PRECOMPTE_PROFESSIONNEL',
        libelle: 'Précompte professionnel',
        base: 259_879,
        taux: null,
        montant: -36_147,
      },
    ]);
  });

  it('marié, conjoint sans revenus, 2 800,00 €', () => {
    // c) 882,21    e) 882,21 / 12 = 73,5175 -> 73,52    précompte 73,52 - 61,82 = 11,70
    const r = calculerPrecompte({ ...entree2800, situation: marie('SANS_REVENUS') }, BLOC);
    expect(r.detail.impotDeBase).toBe(88_221);
    expect(r.detail.precompteAvantBonus).toBe(7_352);
    expect(r.precompte).toBe(1_170);
  });

  it('isolé, 4 000,00 € : pas de bonus', () => {
    // a) base 4 000,00 - 522,80 = 3 477,20    b) x 12 = 41 726,40 ; frais 6 070,00 ; net 35 656,40
    // c) 9 944,05 + 48,15 % x (35 656,40 - 29 500) = 9 944,05 + 2 964,3066 -> 12 908,36 ; - 2 987,98 = 9 920,38
    // e) 9 920,38 / 12 = 826,6983 -> 826,70
    const r = calculerPrecompte(entree4000, BLOC);
    expect(r.detail.baseNetteAnnuelle).toBe(3_565_640);
    expect(r.detail.impotDeBase).toBe(992_038);
    expect(r.precompte).toBe(82_670);
  });

  it('parent isolé avec 2 enfants dont un handicapé', () => {
    // Enfants comptés : 2 + 1 (le handicapé compte double) = 3 -> 4 404,00 ; parent isolé 624,00 (n° 40.1)
    // 9 920,38 - 5 028,00 = 4 892,38 ; / 12 = 407,6983 -> 407,70
    const situation = { ...isole, enfantsCharge: 2, enfantsHandicapes: 1, parentIsole: true };
    const r = calculerPrecompte({ ...entree4000, situation }, BLOC);
    expect(r.detail.reductionsFamille).toBe(502_800);
    expect(r.precompte).toBe(40_770);
  });

  it('autres personnes à charge et salarié handicapé', () => {
    // Salarié handicapé 624 + 1 dépendant de 66 ans 1 992 + (1 autre + 2 x 1 autre handicapé) x 624 = 1 872
    // = 4 488,00 ; 9 920,38 - 4 488,00 = 5 432,38 ; / 12 = 452,6983 -> 452,70
    const situation = {
      ...isole,
      beneficiaireHandicape: true,
      autresChargeDependantes66: 1,
      autresChargeHandicapees: 1,
      autresCharge: 1,
    };
    const r = calculerPrecompte({ ...entree4000, situation }, BLOC);
    expect(r.detail.reductionsFamille).toBe(448_800);
    expect(r.precompte).toBe(45_270);
  });

  it('conjoint aux revenus limités : 1 740 € ou 3 474 € de réduction', () => {
    // 9 920,38 - 1 740,00 = 8 180,38 ; / 12 = 681,6983 -> 681,70
    const limite = calculerPrecompte({ ...entree4000, situation: marie('REVENU_LIMITE') }, BLOC);
    expect(limite.precompte).toBe(68_170);
    // 9 920,38 - 3 474,00 = 6 446,38 ; / 12 = 537,1983 -> 537,20
    const pension = calculerPrecompte({ ...entree4000, situation: marie('PENSION_LIMITEE') }, BLOC);
    expect(pension.precompte).toBe(53_720);
  });

  it('conjoint sans revenus et handicapé : 624 € de réduction (n° 41)', () => {
    const situation = { ...marie('SANS_REVENUS'), conjointHandicape: true };
    const r = calculerPrecompte({ ...entree4000, situation }, BLOC);
    expect(r.detail.reductionsFamille).toBe(62_400);
  });

  it('un petit salaire ne donne pas de précompte (plancher à zéro)', () => {
    // Brut 1 500,00 : base annuelle 18 000,00 ; frais 5 400,00 ; net 12 600,00
    // Impôt 3 370,50 - 2 987,98 = 382,52 ; / 12 = 31,8767 -> 31,88
    // Réduction du bonus : 33,14 % x 127,54 -> 42,27 ; 52,54 % x 68,51 = 35,9951 -> 36,00 ; total 78,27 > 31,88
    const r = calculerPrecompte(
      {
        ...entree4000,
        brutCentimes: 150_000,
        cotisationPersonnelleCentimes: 19_605,
        bonusVoletACentimes: 12_754,
        bonusVoletBCentimes: 6_851,
      },
      BLOC,
    );
    expect(r.detail.baseMensuelle).toBe(150_000);
    expect(r.detail.precompteAvantBonus).toBe(3_188);
    expect(r.detail.reductionBonusEmploi).toBe(7_827);
    expect(r.precompte).toBe(0);
    expect(r.lignes).toEqual([]);
  });
});

describe('calculerPrecompte : attribution des charges (n° 6)', () => {
  const avecEnfant = (chargesFamilleAttribuees: boolean | null) => ({
    ...marie('REVENUS'),
    enfantsCharge: 1,
    chargesFamilleAttribuees,
  });

  it('charges reçues par ce salarié : réduction de 624 €', () => {
    // 9 920,38 - 624,00 = 9 296,38 ; / 12 = 774,6983 -> 774,70
    const r = calculerPrecompte({ ...entree4000, situation: avecEnfant(true) }, BLOC);
    expect(r.precompte).toBe(77_470);
  });

  it('charges reçues par le conjoint : aucune réduction pour ce salarié', () => {
    const r = calculerPrecompte({ ...entree4000, situation: avecEnfant(false) }, BLOC);
    expect(r.detail.reductionsFamille).toBe(0);
    expect(r.precompte).toBe(82_670);
  });

  it('le handicap du salarié suit le choix du couple (lecture littérale du n° 6, D102)', () => {
    const situation = { ...avecEnfant(false), beneficiaireHandicape: true };
    const r = calculerPrecompte({ ...entree4000, situation }, BLOC);
    expect(r.detail.reductionsFamille).toBe(0);
  });

  it('refuse de choisir à la place du couple', () => {
    try {
      calculerPrecompte({ ...entree4000, situation: avecEnfant(null) }, BLOC);
      expect.unreachable();
    } catch (e) {
      expect((e as ErreurMoteur).code).toBe('ATTRIBUTION_CHARGES_MANQUANTE');
    }
  });

  it('sans aucune charge, rien à attribuer : le salarié handicapé reçoit sa réduction', () => {
    const situation = { ...marie('REVENUS'), beneficiaireHandicape: true };
    const r = calculerPrecompte({ ...entree4000, situation }, BLOC);
    expect(r.detail.reductionsFamille).toBe(62_400);
  });
});

describe('calculerPrecompte : refus', () => {
  const refuse = (e: EntreePrecompte, code?: string) => {
    try {
      calculerPrecompte(e, BLOC);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ErreurMoteur);
      if (code) expect((err as ErreurMoteur).code).toBe(code);
    }
  };

  it('non-résident : non pris en charge', () => {
    refuse({ ...entree4000, habitantRoyaume: false }, 'PRECOMPTE_NON_SUPPORTE');
  });

  it('situation incohérente', () => {
    refuse(
      { ...entree4000, situation: { ...isole, conjointRevenus: 'REVENUS' } },
      'ENTREE_INVALIDE',
    );
    refuse({ ...entree4000, situation: marie(null) }, 'ENTREE_INVALIDE');
    refuse({ ...entree4000, situation: { ...isole, enfantsCharge: 1, enfantsHandicapes: 2 } });
    refuse({ ...entree4000, situation: { ...isole, parentIsole: true } }); // pas d'enfant
    refuse({ ...entree4000, situation: { ...marie('REVENUS'), conjointHandicape: true } });
    refuse({ ...entree4000, situation: { ...isole, enfantsCharge: 21 } });
    refuse({ ...entree4000, situation: { ...isole, enfantsCharge: 1.5 } });
  });

  it('montants incohérents', () => {
    refuse({ ...entree4000, brutCentimes: 4_000.5 });
    refuse({ ...entree4000, bonusVoletACentimes: 60_000 }); // bonus plus grand que la cotisation
    refuse({ ...entree4000, cotisationPersonnelleCentimes: 500_000 }); // retenue plus grande que le brut
  });
});
