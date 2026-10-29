// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import { calculerNet, type EntreeNet } from '@/lib/payroll/net';

// Net = brut - cotisation + bonus - précompte - CSSS. Valeurs calculées à la main (en centimes).

const base: EntreeNet = {
  brutCentimes: 400_000,
  cotisationPersonnelleCentimes: 52_280,
  bonusEmploiCentimes: 0,
  precompteCentimes: 82_670,
  csssCentimes: 3_624,
};

describe('calculerNet', () => {
  it('isolé à 4 000 € : 2 614,26 €', () => {
    // 4 000,00 - 522,80 + 0,00 - 826,70 - 36,24 = 2 614,26
    expect(calculerNet(base)).toBe(261_426);
  });

  it('ajoute le bonus à l’emploi, qui réduit la cotisation', () => {
    // 2 800,00 - 365,96 + 164,75 (127,54 + 37,21) - 361,47 - 17,04 = 2 220,28
    expect(
      calculerNet({
        brutCentimes: 280_000,
        cotisationPersonnelleCentimes: 36_596,
        bonusEmploiCentimes: 16_475,
        precompteCentimes: 36_147,
        csssCentimes: 1_704,
      }),
    ).toBe(222_028);
  });

  it('ajoute un remboursement de CSSS (valeur négative)', () => {
    // 4 000,00 - 522,80 - 826,70 + 34,08 = 2 684,58
    expect(calculerNet({ ...base, csssCentimes: -3_408 })).toBe(268_458);
  });

  it('accepte un net négatif : l’anomalie est signalée plus tard (étape 8)', () => {
    // 100,00 - 13,07 - 0,00 - 200,00 = -113,07
    expect(
      calculerNet({
        brutCentimes: 10_000,
        cotisationPersonnelleCentimes: 1_307,
        bonusEmploiCentimes: 0,
        precompteCentimes: 0,
        csssCentimes: 20_000,
      }),
    ).toBe(-11_307);
  });

  it('refuse un montant décimal ou négatif (hors CSSS)', () => {
    expect(() => calculerNet({ ...base, brutCentimes: 100.5 })).toThrow(ErreurMoteur);
    expect(() => calculerNet({ ...base, precompteCentimes: -1 })).toThrow(ErreurMoteur);
  });

  it('refuse un bonus supérieur à la cotisation qu’il réduit', () => {
    expect(() => calculerNet({ ...base, bonusEmploiCentimes: 52_281 })).toThrow(ErreurMoteur);
  });
});
