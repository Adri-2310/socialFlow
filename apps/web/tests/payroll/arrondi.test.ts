// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appliquerTaux, arrondirFraction, proratiser } from '@/lib/payroll/arrondi';
import { ErreurMoteur } from '@/lib/payroll/erreurs';

// Valeurs attendues calculées à la main (règle : Annexe III n° 12, la moitié monte).
describe('arrondirFraction', () => {
  it('arrondit au cent supérieur quand le millième atteint 5', () => {
    expect(arrondirFraction(200_001, 2)).toBe(100_001); // 100 000,5 centimes
    expect(arrondirFraction(1, 2)).toBe(1); // 0,5 centime
  });

  it('arrondit au cent inférieur quand le millième est sous 5', () => {
    expect(arrondirFraction(1_000_004, 10)).toBe(100_000); // 100 000,4 centimes
    expect(arrondirFraction(49, 100)).toBe(0); // 0,49 centime
  });

  it('ne change pas un montant déjà exact', () => {
    expect(arrondirFraction(12_345, 1)).toBe(12_345);
    expect(arrondirFraction(0, 7)).toBe(0);
  });

  it('refuse un flottant, un montant négatif, un dénominateur nul ou négatif', () => {
    expect(() => arrondirFraction(1.5, 2)).toThrow(ErreurMoteur);
    expect(() => arrondirFraction(1, 2.5)).toThrow(ErreurMoteur);
    expect(() => arrondirFraction(-1, 2)).toThrow(ErreurMoteur);
    expect(() => arrondirFraction(1, 0)).toThrow(ErreurMoteur);
    expect(() => arrondirFraction(1, -2)).toThrow(ErreurMoteur);
  });

  it('refuse un montant qui dépasse les entiers sûrs', () => {
    expect(() => arrondirFraction(Number.MAX_SAFE_INTEGER, 1)).toThrow(ErreurMoteur);
  });
});

describe('appliquerTaux', () => {
  it('applique un taux en dix-millièmes de pour cent', () => {
    expect(appliquerTaux(100_000, 267_500)).toBe(26_750); // 26,75 % de 1 000,00 €
    expect(appliquerTaux(100_000, 1_000_000)).toBe(100_000); // 100 %
  });

  it('arrondit la moitié vers le haut', () => {
    expect(appliquerTaux(1, 500_000)).toBe(1); // 50 % de 1 centime = 0,5
    expect(appliquerTaux(1, 499_999)).toBe(0);
  });
});

describe('proratiser', () => {
  it('applique une fraction exacte', () => {
    expect(proratiser(300_000, { numerateur: 4, denominateur: 5 })).toBe(240_000);
  });

  it('arrondit la moitié vers le haut', () => {
    expect(proratiser(100_001, { numerateur: 1, denominateur: 2 })).toBe(50_001); // 50 000,5
  });
});
