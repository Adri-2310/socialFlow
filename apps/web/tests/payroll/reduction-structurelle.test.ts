// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import {
  calculerReductionStructurelle,
  type EntreeReductionStructurelle,
} from '@/lib/payroll/reduction-structurelle';
import { REDUCTION_STRUCTURELLE_2026_3 as BLOC } from './fixtures-bareme';

// Valeurs attendues calculées à la main à partir du document ONSS 2026/3 (calcul en commentaire).
// Montants en centimes : 674,38 € s'écrit 67 438. S = salaire trimestriel de référence,
// R = montant de base du trimestre, µ = part des prestations.

const entree = (surcharge: Partial<EntreeReductionStructurelle>): EntreeReductionStructurelle => ({
  brutReferenceCentimes: 280_000,
  prestations: { unite: 'JOURS', realisees: 22, pleinTemps: 22 },
  contratAuMoinsMiTemps: true,
  cotisationsReductiblesCentimes: 69_997,
  ...surcharge,
});

describe('calculerReductionStructurelle : temps plein', () => {
  it('employé à 2 800 € : 224,79 € par mois', () => {
    // S = 3 x 2 800,00 = 8 400,00
    // terme 1 : 0,14 x (11 687,74 - 8 400,00) = 460,2836 -> 460,28
    // terme 2 : 0,16 x ( 9 738,14 - 8 400,00) = 214,1024 -> 214,10
    // R = 674,38 ; µ = 1 -> réduction complète : Ps = R ; mois = 674,38 / 3 = 224,7933 -> 224,79
    const r = calculerReductionStructurelle(entree({}), BLOC);
    expect(r.salaireReferenceTrimestre).toBe(840_000);
    expect(r.montantBaseTrimestre).toBe(67_438);
    expect(r.prestationsCentiemes).toBe(100);
    expect(r.reduction).toBe(22_479);
    expect(r.lignes).toEqual([
      {
        code: 'REDUCTION_STRUCTURELLE',
        libelle: 'Réduction structurelle des cotisations patronales',
        base: 840_000,
        taux: null,
        montant: -22_479,
      },
    ]);
  });

  it('ne donne rien au-dessus du plafond S0', () => {
    // S = 3 x 4 000,00 = 12 000,00 >= 11 687,74 : les deux termes sont nuls
    const r = calculerReductionStructurelle(entree({ brutReferenceCentimes: 400_000 }), BLOC);
    expect(r.reduction).toBe(0);
    expect(r.lignes).toEqual([]);
  });

  it('ne dépasse jamais les cotisations réductibles', () => {
    // brut 100,00 : S = 300,00 ; R = 0,14 x 11 387,74 + 0,16 x 9 438,14 = 1 594,2836 + 1 510,1024
    // -> 1 594,28 + 1 510,10 = 3 104,38 ; un tiers = 1 034,79, plafonné à 25,00
    const r = calculerReductionStructurelle(
      entree({ brutReferenceCentimes: 10_000, cotisationsReductiblesCentimes: 2_500 }),
      BLOC,
    );
    expect(r.montantBaseTrimestre).toBe(310_438);
    expect(r.reduction).toBe(2_500);
  });
});

describe('calculerReductionStructurelle : prestations partielles', () => {
  it('µ = 0,55 : début de la progression de beta (beta = 1,18)', () => {
    // 12 jours sur 22 : µ = 0,5454 -> 0,55. W = 1 500,00 ; W / J = 125,00 ; S mois = 125 x 22 = 2 750,00 ;
    // S = 8 250,00 ; terme 1 : 0,14 x 3 437,74 = 481,2836 -> 481,28 ; terme 2 : 0,16 x 1 488,14 =
    // 238,1024 -> 238,10 ; R = 719,38. Ps = 719,38 x 0,55 x 1,18 = 466,87762 -> 466,88 ;
    // mois = 466,88 / 3 = 155,6267 -> 155,63
    const r = calculerReductionStructurelle(
      entree({
        brutReferenceCentimes: 150_000,
        prestations: { unite: 'JOURS', realisees: 12, pleinTemps: 22 },
        cotisationsReductiblesCentimes: 37_498,
      }),
      BLOC,
    );
    expect(r.prestationsCentiemes).toBe(55);
    expect(r.montantBaseTrimestre).toBe(71_938);
    expect(r.reduction).toBe(15_563);
  });

  it('µ = 0,70 : beta = 1,18 + (0,70 - 0,55) x 0,28 = 1,222', () => {
    // 14 jours sur 20. W = 2 000,00 ; W / J = 142,857 -> 142,86 ; S mois = 142,86 x 20 = 2 857,20 ;
    // S = 8 571,60 ; terme 1 : 0,14 x 3 116,14 = 436,2596 -> 436,26 ; terme 2 : 0,16 x 1 166,54 =
    // 186,6464 -> 186,65 ; R = 622,91. Ps = 622,91 x 0,70 x 1,222 = 532,8372 -> 532,84 ;
    // mois = 532,84 / 3 = 177,6133 -> 177,61
    const r = calculerReductionStructurelle(
      entree({
        brutReferenceCentimes: 200_000,
        prestations: { unite: 'JOURS', realisees: 14, pleinTemps: 20 },
      }),
      BLOC,
    );
    expect(r.salaireReferenceTrimestre).toBe(857_160);
    expect(r.montantBaseTrimestre).toBe(62_291);
    expect(r.reduction).toBe(17_761);
  });

  it('µ >= 0,80 : réduction complète, comme à temps plein', () => {
    // 19 jours sur 22 : µ = 0,86. W = 2 000,00 ; W / J = 105,263 -> 105,26 ; S mois = 105,26 x 22 =
    // 2 315,72 ; S = 6 947,16 ; terme 1 : 0,14 x 4 740,58 = 663,6812 -> 663,68 ; terme 2 :
    // 0,16 x 2 790,98 = 446,5568 -> 446,56 ; R = 1 110,24 ; Ps = R ; mois = 370,08
    const r = calculerReductionStructurelle(
      entree({
        brutReferenceCentimes: 200_000,
        prestations: { unite: 'JOURS', realisees: 19, pleinTemps: 22 },
        cotisationsReductiblesCentimes: 100_000,
      }),
      BLOC,
    );
    expect(r.prestationsCentiemes).toBe(86);
    expect(r.montantBaseTrimestre).toBe(111_024);
    expect(r.reduction).toBe(37_008);
  });

  it('µ < 0,275 : rien sans contrat à mi-temps, beta = 1,18 avec', () => {
    // 4 jours sur 20 : µ = 0,20. W = 400,00 ; W / J = 100,00 ; S mois = 2 000,00 ; S = 6 000,00 ;
    // terme 1 : 0,14 x 5 687,74 = 796,2836 -> 796,28 ; terme 2 : 0,16 x 3 738,14 = 598,1024 -> 598,10 ;
    // R = 1 394,38. Ps = 1 394,38 x 0,20 x 1,18 = 329,07368 -> 329,07 ; mois = 109,69
    const base = {
      brutReferenceCentimes: 40_000,
      prestations: { unite: 'JOURS', realisees: 4, pleinTemps: 20 } as const,
      cotisationsReductiblesCentimes: 100_000,
    };
    expect(
      calculerReductionStructurelle(entree({ ...base, contratAuMoinsMiTemps: false }), BLOC)
        .reduction,
    ).toBe(0);
    const r = calculerReductionStructurelle(entree({ ...base, contratAuMoinsMiTemps: true }), BLOC);
    expect(r.montantBaseTrimestre).toBe(139_438);
    expect(r.reduction).toBe(10_969);
  });

  it('prestations en minutes : µ = 0,28 dépasse le plancher de 0,275 même sans mi-temps', () => {
    // 2 800 minutes sur 10 000 (µ = 0,28). W = 1 000,00 ; salaire horaire = 1 000 x 60 / 2 800 =
    // 21,4286 -> 21,43 ; S mois = 21,43 x (10 000 / 60 = 166,67 h) = 3 571,67 ; S = 10 715,01 ;
    // terme 1 : 0,14 x 972,73 = 136,1822 -> 136,18 ; terme 2 : S >= S2 -> 0 ; R = 136,18.
    // Ps = 136,18 x 0,28 x 1,18 = 44,993872 -> 44,99 ; mois = 14,9967 -> 15,00
    const r = calculerReductionStructurelle(
      entree({
        brutReferenceCentimes: 100_000,
        prestations: { unite: 'MINUTES', realisees: 2_800, pleinTemps: 10_000 },
        contratAuMoinsMiTemps: false,
        cotisationsReductiblesCentimes: 100_000,
      }),
      BLOC,
    );
    expect(r.prestationsCentiemes).toBe(28);
    expect(r.montantBaseTrimestre).toBe(13_618);
    expect(r.reduction).toBe(1_500);
  });

  it('ne donne rien sans prestation', () => {
    const r = calculerReductionStructurelle(
      entree({ prestations: { unite: 'JOURS', realisees: 0, pleinTemps: 22 } }),
      BLOC,
    );
    expect(r).toMatchObject({ reduction: 0, lignes: [] });
  });
});

describe('calculerReductionStructurelle : entrées refusées', () => {
  it('refuse les montants, prestations et booléens incohérents', () => {
    for (const surcharge of [
      { brutReferenceCentimes: 100.5 },
      { cotisationsReductiblesCentimes: -1 },
      { prestations: { unite: 'SEMAINES' as never, realisees: 1, pleinTemps: 1 } },
      { prestations: { unite: 'JOURS' as const, realisees: 40, pleinTemps: 22 } },
      { contratAuMoinsMiTemps: undefined as never },
    ]) {
      expect(() => calculerReductionStructurelle(entree(surcharge), BLOC)).toThrow(ErreurMoteur);
    }
  });
});
