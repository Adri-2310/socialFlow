// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import {
  calculerHeuresSupplementaires,
  type EntreeHeuresSupplementaires,
  type HeuresSupplementaires,
} from '@/lib/payroll/heures-supplementaires';
import { HEURES_SUPPLEMENTAIRES_2026 as BLOC } from './fixtures-bareme';

// Valeurs attendues calculées à la main (calcul en commentaire). Taux horaire : 20,00 €/h = 2 000
// centimes. 60 minutes = 2 000 centimes de base ; 300 minutes (5 h) = 10 000 centimes (100,00 €).

const aucune: HeuresSupplementaires = {
  volontairesSansSursalaire: 0,
  volontaires50: 0,
  volontaires100: 0,
  ordinaires50: 0,
  ordinaires100: 0,
};

const entree = (
  ceMois: Partial<HeuresSupplementaires>,
  cumulAvantCeMois: Partial<HeuresSupplementaires> = {},
  surcharge: Partial<EntreeHeuresSupplementaires> = {},
): EntreeHeuresSupplementaires => ({
  tauxHoraireCentimes: 2_000,
  ceMois: { ...aucune, ...ceMois },
  cumulAvantCeMois: { ...aucune, ...cumulAvantCeMois },
  ...surcharge,
});

describe('calculerHeuresSupplementaires : chaque sorte d’heure', () => {
  it('rien à signaler quand il n’y a pas d’heure', () => {
    expect(calculerHeuresSupplementaires(entree({}), BLOC)).toEqual({
      brutImposable: 0,
      baseOnss: 0,
      netExonere: 0,
      reductionPrecompte: 0,
      cumulVolontairesMinutes: 0,
      lignes: [],
    });
  });

  it('volontaires sans sursalaire : 10 h au net, hors brut', () => {
    // 600 minutes x 2 000 / 60 = 20 000 centimes = 200,00 €
    const r = calculerHeuresSupplementaires(entree({ volontairesSansSursalaire: 600 }), BLOC);
    expect(r).toMatchObject({
      brutImposable: 0,
      baseOnss: 0,
      netExonere: 20_000,
      reductionPrecompte: 0,
      cumulVolontairesMinutes: 600,
    });
    expect(r.lignes).toEqual([
      {
        code: 'HEURES_SUP_VOLONTAIRES_NETTES',
        libelle: 'Heures supplémentaires volontaires sans sursalaire (exonérées)',
        base: 20_000,
        taux: null,
        montant: 20_000,
      },
    ]);
  });

  it('ordinaires à 50 % : soumises à l’ONSS, avec réduction de précompte', () => {
    // 5 h : base 100,00 ; sursalaire 50 % = 50,00 ; total 150,00 € (15 000)
    // réduction : 57,75 % x 100,00 = 57,75 € (5 775)
    const r = calculerHeuresSupplementaires(entree({ ordinaires50: 300 }), BLOC);
    expect(r).toMatchObject({
      brutImposable: 15_000,
      baseOnss: 15_000,
      netExonere: 0,
      reductionPrecompte: 5_775,
      cumulVolontairesMinutes: 0,
    });
    expect(r.lignes).toEqual([
      {
        code: 'HEURES_SUP_ORDINAIRES_50',
        libelle: 'Heures supplémentaires à 50 %',
        base: 10_000,
        taux: 500_000,
        montant: 15_000,
      },
    ]);
  });

  it('ordinaires à 100 % (dimanche, jour férié)', () => {
    // 5 h : base 100,00 ; sursalaire 100,00 ; total 200,00 € ; réduction 57,75 €
    const r = calculerHeuresSupplementaires(entree({ ordinaires100: 300 }), BLOC);
    expect(r).toMatchObject({ brutImposable: 20_000, baseOnss: 20_000, reductionPrecompte: 5_775 });
  });

  it('volontaires à 100 % : dans le brut imposable mais hors ONSS', () => {
    // 2 h 30 = 150 minutes : base 50,00 ; sursalaire 50,00 ; total 100,00 €
    // réduction : 57,75 % x 50,00 = 28,875 -> 28,88 € (la moitié monte)
    const r = calculerHeuresSupplementaires(entree({ volontaires100: 150 }), BLOC);
    expect(r).toMatchObject({
      brutImposable: 10_000,
      baseOnss: 0,
      reductionPrecompte: 2_888,
      cumulVolontairesMinutes: 150,
    });
  });

  it('les trois sortes ensemble', () => {
    // net : 200,00 ; ordinaires 50 % 150,00 (ONSS) ; volontaires 100 % 100,00 (hors ONSS)
    // brut imposable 250,00 ; base ONSS 150,00
    // réduction : 57,75 % x (100,00 + 50,00) = 86,625 -> 86,63 €
    const r = calculerHeuresSupplementaires(
      entree({ volontairesSansSursalaire: 600, ordinaires50: 300, volontaires100: 150 }),
      BLOC,
    );
    expect(r).toMatchObject({
      brutImposable: 25_000,
      baseOnss: 15_000,
      netExonere: 20_000,
      reductionPrecompte: 8_663,
      cumulVolontairesMinutes: 750,
    });
    expect(r.lignes.map((l) => l.code)).toEqual([
      'HEURES_SUP_VOLONTAIRES_NETTES',
      'HEURES_SUP_ORDINAIRES_50',
      'HEURES_SUP_VOLONTAIRES_100',
    ]);
  });

  it('arrondit à chaque étape, la moitié monte', () => {
    // 1 minute : 2 000 / 60 = 33,33 -> 33 ; sursalaire 50 % de 33 = 16,5 -> 17 ; total 50
    const r = calculerHeuresSupplementaires(entree({ ordinaires50: 1 }), BLOC);
    expect(r.brutImposable).toBe(50);
  });
});

describe('calculerHeuresSupplementaires : réduction limitée aux 130 premières heures', () => {
  // 130 h = 7 800 minutes
  it('ne compte que ce qui reste du plafond', () => {
    // déjà 7 740 minutes (129 h) : il reste 60 minutes ; 5 h payées en entier
    // réduction : 57,75 % x 20,00 = 11,55 € (1 155)
    const r = calculerHeuresSupplementaires(
      entree({ ordinaires50: 300 }, { ordinaires50: 7_740 }),
      BLOC,
    );
    expect(r.brutImposable).toBe(15_000);
    expect(r.reductionPrecompte).toBe(1_155);
  });

  it('plus de réduction une fois les 130 heures atteintes', () => {
    const r = calculerHeuresSupplementaires(
      entree({ ordinaires50: 300 }, { ordinaires50: 7_800 }),
      BLOC,
    );
    expect(r.brutImposable).toBe(15_000);
    expect(r.reductionPrecompte).toBe(0);
  });

  it('les heures sans sursalaire ne comptent pas dans les 130 heures', () => {
    const r = calculerHeuresSupplementaires(
      entree({ ordinaires50: 300 }, { volontairesSansSursalaire: 7_800 }),
      BLOC,
    );
    expect(r.reductionPrecompte).toBe(5_775);
  });
});

describe('calculerHeuresSupplementaires : plafonds annuels', () => {
  it('240 heures sans sursalaire : pile accepté, une minute de plus refusé', () => {
    // 240 h = 14 400 minutes ; il en reste 60 : 60 minutes = 20,00 €
    const ok = calculerHeuresSupplementaires(
      entree({ volontairesSansSursalaire: 60 }, { volontairesSansSursalaire: 14_340 }),
      BLOC,
    );
    expect(ok.netExonere).toBe(2_000);
    expect(() =>
      calculerHeuresSupplementaires(
        entree({ volontairesSansSursalaire: 61 }, { volontairesSansSursalaire: 14_340 }),
        BLOC,
      ),
    ).toThrow(/sans sursalaire/);
  });

  it('360 heures volontaires au total : pile accepté, une minute de plus refusé', () => {
    // 360 h = 21 600 minutes ; déjà 21 500 (sans sursalaire et avec) : il reste 100 minutes
    const cumul = { volontairesSansSursalaire: 14_400, volontaires50: 7_100 };
    const ok = calculerHeuresSupplementaires(entree({ volontaires100: 100 }, cumul), BLOC);
    expect(ok.cumulVolontairesMinutes).toBe(21_600);
    try {
      calculerHeuresSupplementaires(entree({ volontaires100: 101 }, cumul), BLOC);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurMoteur);
      expect((e as ErreurMoteur).code).toBe('PLAFOND_HEURES_DEPASSE');
    }
  });

  it('les heures ordinaires ne comptent pas dans les 360 heures volontaires', () => {
    const r = calculerHeuresSupplementaires(
      entree({ ordinaires50: 600 }, { volontaires50: 21_600 }),
      BLOC,
    );
    expect(r.brutImposable).toBe(30_000);
  });
});

describe('calculerHeuresSupplementaires : entrées refusées', () => {
  it('refuse les taux, minutes et cumuls incohérents', () => {
    for (const e of [
      entree({}, {}, { tauxHoraireCentimes: 0 }),
      entree({}, {}, { tauxHoraireCentimes: 20.5 }),
      entree({ ordinaires50: -1 }),
      entree({ ordinaires50: 1.5 }),
      entree({ ordinaires50: 45_000 }),
      entree({}, { volontaires50: -1 }),
      entree({}, { volontaires50: 600_000 }),
    ]) {
      expect(() => calculerHeuresSupplementaires(e, BLOC)).toThrow(ErreurMoteur);
    }
  });
});
