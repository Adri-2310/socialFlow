// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { arrondirFraction } from '@/lib/payroll/arrondi';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import { DIVISEUR_TAUX } from '@/lib/payroll/types';
import { BORNES, exigerEntier } from '@/lib/payroll/validation';

describe('BORNES', () => {
  it('le montant maximal reste exact dans le pire calcul : montant x taux maximal', () => {
    // Le pire produit du moteur : le montant maximal fois un taux de 10 x 100 %.
    expect(() =>
      arrondirFraction(BORNES.montantMax * 10 * DIVISEUR_TAUX, DIVISEUR_TAUX),
    ).not.toThrow();
  });

  it('le montant maximal est le plus grand : un centime de plus ferait déborder le calcul', () => {
    expect(() =>
      arrondirFraction((BORNES.montantMax + 1) * 10 * DIVISEUR_TAUX, DIVISEUR_TAUX),
    ).toThrow(ErreurMoteur);
  });

  it('se déduisent du calendrier et de D96', () => {
    expect(BORNES.joursDansUnMoisMax).toBe(31);
    expect(BORNES.minutesDansUnMoisMax).toBe(44_640); // 31 x 24 x 60
    expect(BORNES.minutesSemaineMax).toBe(3_600); // 60 h
  });
});

describe('exigerEntier', () => {
  it("accepte les bornes incluses et refuse ce qui les dépasse ou n'est pas entier", () => {
    expect(exigerEntier('x', 0, 0, 5)).toBe(0);
    expect(exigerEntier('x', 5, 0, 5)).toBe(5);
    expect(() => exigerEntier('x', 6, 0, 5)).toThrow(ErreurMoteur);
    expect(() => exigerEntier('x', -1, 0, 5)).toThrow(ErreurMoteur);
    expect(() => exigerEntier('x', 1.5, 0, 5)).toThrow(ErreurMoteur);
    expect(() => exigerEntier('x', '1', 0, 5)).toThrow(ErreurMoteur);
    expect(() => exigerEntier('x', NaN, 0, 5)).toThrow(ErreurMoteur);
  });
});
