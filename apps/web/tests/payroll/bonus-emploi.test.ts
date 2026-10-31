// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  calculerBonusEmploi,
  calculerSalaireReference,
  type EntreeBonusEmploi,
} from '@/lib/payroll/bonus-emploi';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import { BONUS_EMPLOI_2026_09 as BAREME } from './fixtures-bareme';

// Toutes les valeurs attendues sont calculées à la main à partir des tableaux de l'ONSS 2026/3
// (p. 451-452) ; le calcul est détaillé en commentaire. Montants en centimes.

// Un employé à temps plein, mois complet de 22 jours, sans bonus déjà pris : on ne change que
// ce que le test veut étudier.
const base: EntreeBonusEmploi = {
  categorie: 'EMPLOYE',
  brutReferenceCentimes: 250_000,
  prestations: { unite: 'JOURS', realisees: 22, pleinTemps: 22 },
  cotisationPersonnelleCentimes: 32_675,
  bonusDejaPrisAnneeCentimes: 0,
};
const montant = (r: ReturnType<typeof calculerBonusEmploi>, code: string) =>
  r.lignes.find((l) => l.code === code)?.montant ?? 0;

describe('calculerSalaireReference', () => {
  it('prestations complètes : S = W', () => {
    expect(
      calculerSalaireReference(250_000, { unite: 'JOURS', realisees: 22, pleinTemps: 22 }),
    ).toBe(250_000);
  });

  it('temps plein incomplet : exemple 1 du document (p. 453)', () => {
    // W = 2 015,00 ; J = 19 ; D = 22 : 2 015,00 / 19 = 106,0526 -> 106,05 ; x 22 = 2 333,10 €
    expect(
      calculerSalaireReference(201_500, { unite: 'JOURS', realisees: 19, pleinTemps: 22 }),
    ).toBe(233_310);
  });

  it('temps partiel en minutes : S = (W / H) x U', () => {
    // W = 1 250,00 ; H = 82 h 20 (4 940 min) ; U = 164 h 40 (9 880 min).
    // Salaire horaire : 1 250,00 / 82,3333 = 15,1822 -> 15,18 € ; x 164,6667 h = 2 499,64 €
    expect(
      calculerSalaireReference(125_000, { unite: 'MINUTES', realisees: 4_940, pleinTemps: 9_880 }),
    ).toBe(249_964);
  });
});

describe('calculerBonusEmploi : employé à temps plein', () => {
  it('S = 2 500,00 € : volet A plein + volet B dégressif', () => {
    // A : 2 500,00 <= 2 937,93 -> 127,54
    // B : 171,99 - 0,2699 x (2 500,00 - 2 300,62) = 171,99 - 53,8127 = 118,1773 -> 118,18
    // Total 245,72 ; cotisation 326,75 -> le bonus passe en entier.
    const r = calculerBonusEmploi(base, BAREME);
    expect(montant(r, 'BONUS_EMPLOI_A')).toBe(12_754);
    expect(montant(r, 'BONUS_EMPLOI_B')).toBe(11_818);
    expect(r.bonus).toBe(24_572);
    expect([r.voletA, r.voletB]).toEqual([12_754, 11_818]);
    expect(r.salaireReference).toBe(250_000);
  });

  it('S = 3 000,00 € : seul le volet A subsiste, en dégressif', () => {
    // A : 127,54 - 0,2739 x (3 000,00 - 2 937,93) = 127,54 - 17,0010 = 110,5390 -> 110,54
    // B : 3 000,00 > 2 937,93 -> 0
    const r = calculerBonusEmploi(
      { ...base, brutReferenceCentimes: 300_000, cotisationPersonnelleCentimes: 39_210 },
      BAREME,
    );
    expect(montant(r, 'BONUS_EMPLOI_A')).toBe(11_054);
    expect(r.lignes.map((l) => l.code)).toEqual(['BONUS_EMPLOI_A']);
    expect(r.bonus).toBe(11_054);
  });

  it('S = 4 000,00 € : au-dessus du plafond, pas de bonus ni de ligne', () => {
    const r = calculerBonusEmploi(
      { ...base, brutReferenceCentimes: 400_000, cotisationPersonnelleCentimes: 52_280 },
      BAREME,
    );
    expect(r.bonus).toBe(0);
    expect(r.lignes).toEqual([]);
  });

  it('S = 2 937,93 € exactement : A plein (127,54), B nul (la formule donnerait -0,02 €, jamais négatif)', () => {
    // B : 171,99 - 0,2699 x (2 937,93 - 2 300,62) = 171,99 - 172,0100 = -0,0200 -> 0
    const r = calculerBonusEmploi(
      { ...base, brutReferenceCentimes: 293_793, cotisationPersonnelleCentimes: 38_400 },
      BAREME,
    );
    expect(montant(r, 'BONUS_EMPLOI_A')).toBe(12_754);
    expect(montant(r, 'BONUS_EMPLOI_B')).toBe(0);
  });

  it("petit salaire : le bonus est écrêté à la cotisation, en retirant d'abord le volet B", () => {
    // S = 2 000,00 : A 127,54 + B 171,99 = 299,53 ; cotisation 13,07 % x 2 000,00 = 261,40.
    // Excédent 299,53 - 261,40 = 38,13 retiré du volet B : 171,99 - 38,13 = 133,86 ; A intact.
    const r = calculerBonusEmploi(
      { ...base, brutReferenceCentimes: 200_000, cotisationPersonnelleCentimes: 26_140 },
      BAREME,
    );
    expect(montant(r, 'BONUS_EMPLOI_A')).toBe(12_754);
    expect(montant(r, 'BONUS_EMPLOI_B')).toBe(13_386);
    expect(r.bonus).toBe(26_140); // toute la cotisation est compensée
  });

  it('écrêtement plus grand que le volet B : le reste est retiré du volet A', () => {
    // Cotisation de 50,00 € seulement : B (118,18) est retiré en entier, puis A : 127,54 - (245,72 - 50,00 - 118,18) = 50,00.
    const r = calculerBonusEmploi({ ...base, cotisationPersonnelleCentimes: 5_000 }, BAREME);
    expect(montant(r, 'BONUS_EMPLOI_B')).toBe(0);
    expect(montant(r, 'BONUS_EMPLOI_A')).toBe(5_000);
    expect(r.bonus).toBe(5_000);
  });
});

describe('calculerBonusEmploi : ouvrier', () => {
  it('S = 2 500,00 € (brut à 100 %) avec les tableaux des ouvriers', () => {
    // A : 137,74 (S <= 2 937,93)
    // B : 185,75 - 0,2915 x (2 500,00 - 2 300,62) = 185,75 - 58,1193 = 127,6307 -> 127,63
    // Total 265,37 ; cotisation sur 2 500,00 x 108 % = 2 700,00 x 13,07 % = 352,89 -> passe en entier.
    const r = calculerBonusEmploi(
      { ...base, categorie: 'OUVRIER', cotisationPersonnelleCentimes: 35_289 },
      BAREME,
    );
    expect(montant(r, 'BONUS_EMPLOI_A')).toBe(13_774);
    expect(montant(r, 'BONUS_EMPLOI_B')).toBe(12_763);
    expect(r.bonus).toBe(26_537);
  });
});

describe('calculerBonusEmploi : prestations incomplètes', () => {
  it('temps plein, 19 jours sur 22 : S de référence relevé, bonus x 0,86', () => {
    // W = 2 015,00 -> S = 2 333,10 (voir plus haut). Part prestée : 19 / 22 = 0,8636 -> 0,86.
    // A : 127,54 (plein) ; B : 171,99 - 0,2699 x (2 333,10 - 2 300,62) = 171,99 - 8,7662 = 163,2236 -> 163,22
    // P_A = 127,54 x 0,86 = 109,6844 -> 109,68 ; P_B = 163,22 x 0,86 = 140,3692 -> 140,37
    const r = calculerBonusEmploi(
      {
        ...base,
        brutReferenceCentimes: 201_500,
        prestations: { unite: 'JOURS', realisees: 19, pleinTemps: 22 },
        cotisationPersonnelleCentimes: 26_336,
      },
      BAREME,
    );
    expect(r.salaireReference).toBe(233_310);
    expect(montant(r, 'BONUS_EMPLOI_A')).toBe(10_968);
    expect(montant(r, 'BONUS_EMPLOI_B')).toBe(14_037);
    expect(r.bonus).toBe(25_005);
  });

  it('temps partiel au demi-temps (en minutes) : la moitié du bonus, chaque volet arrondi', () => {
    // W = 1 250,00 ; H = 4 940 min ; U = 9 880 min -> S = 2 499,64 ; part prestée 0,50.
    // A : 127,54 ; B : 171,99 - 0,2699 x (2 499,64 - 2 300,62) = 171,99 - 53,7155 = 118,2745 -> 118,27
    // P_A = 127,54 x 0,50 = 63,77 ; P_B = 118,27 x 0,50 = 59,135 -> 59,14 (la moitié monte)
    const r = calculerBonusEmploi(
      {
        ...base,
        brutReferenceCentimes: 125_000,
        prestations: { unite: 'MINUTES', realisees: 4_940, pleinTemps: 9_880 },
        cotisationPersonnelleCentimes: 16_338,
      },
      BAREME,
    );
    expect(r.salaireReference).toBe(249_964);
    expect(montant(r, 'BONUS_EMPLOI_A')).toBe(6_377);
    expect(montant(r, 'BONUS_EMPLOI_B')).toBe(5_914);
    expect(r.bonus).toBe(12_291);
  });

  it('aucune prestation : pas de bonus', () => {
    const r = calculerBonusEmploi(
      {
        ...base,
        brutReferenceCentimes: 0,
        prestations: { unite: 'JOURS', realisees: 0, pleinTemps: 22 },
      },
      BAREME,
    );
    expect(r).toEqual({ bonus: 0, voletA: 0, voletB: 0, salaireReference: 0, lignes: [] });
  });
});

describe('calculerBonusEmploi : plafond annuel (3 594,36 €)', () => {
  it("ne laisse passer que ce qui reste, en retirant d'abord le volet B", () => {
    // Déjà pris 3 494,36 € -> il reste 100,00 €. Bonus calculé 245,72 : excédent 145,72.
    // Volet B (118,18) retiré en entier, puis 27,54 au volet A : 127,54 - 27,54 = 100,00.
    const r = calculerBonusEmploi({ ...base, bonusDejaPrisAnneeCentimes: 349_436 }, BAREME);
    expect(montant(r, 'BONUS_EMPLOI_B')).toBe(0);
    expect(montant(r, 'BONUS_EMPLOI_A')).toBe(10_000);
    expect(r.bonus).toBe(10_000);
  });

  it('plafond déjà atteint : plus de bonus', () => {
    const r = calculerBonusEmploi({ ...base, bonusDejaPrisAnneeCentimes: 359_436 }, BAREME);
    expect(r.bonus).toBe(0);
    expect(r.lignes).toEqual([]);
  });

  it('refuse un total déjà pris supérieur au plafond annuel', () => {
    expect(() =>
      calculerBonusEmploi({ ...base, bonusDejaPrisAnneeCentimes: 359_437 }, BAREME),
    ).toThrow(ErreurMoteur);
  });
});

describe('calculerBonusEmploi : entrées invalides', () => {
  it('refuse les montants flottants ou négatifs', () => {
    expect(() => calculerBonusEmploi({ ...base, brutReferenceCentimes: 2_500.5 }, BAREME)).toThrow(
      ErreurMoteur,
    );
    expect(() =>
      calculerBonusEmploi({ ...base, cotisationPersonnelleCentimes: -1 }, BAREME),
    ).toThrow(ErreurMoteur);
    expect(() => calculerBonusEmploi({ ...base, bonusDejaPrisAnneeCentimes: -1 }, BAREME)).toThrow(
      ErreurMoteur,
    );
  });

  it('refuse des prestations impossibles', () => {
    const avec = (realisees: number, pleinTemps: number, unite: 'JOURS' | 'MINUTES' = 'JOURS') =>
      calculerBonusEmploi({ ...base, prestations: { unite, realisees, pleinTemps } }, BAREME);
    expect(() => avec(-1, 22)).toThrow(ErreurMoteur);
    expect(() => avec(10, 0)).toThrow(ErreurMoteur); // un mois de temps plein ne peut pas valoir 0
    expect(() => avec(10, 32)).toThrow(ErreurMoteur); // plus de 31 jours
    expect(() => avec(10, 44_641, 'MINUTES')).toThrow(ErreurMoteur);
    expect(() => avec(10.5, 22)).toThrow(ErreurMoteur);
  });

  it('refuse un statut ou une unité inconnus', () => {
    expect(() =>
      calculerBonusEmploi({ ...base, categorie: 'CADRE' as unknown as 'EMPLOYE' }, BAREME),
    ).toThrow(ErreurMoteur);
    expect(() =>
      calculerBonusEmploi(
        {
          ...base,
          prestations: { unite: 'HEURES' as unknown as 'JOURS', realisees: 1, pleinTemps: 2 },
        },
        BAREME,
      ),
    ).toThrow(ErreurMoteur);
  });
});
