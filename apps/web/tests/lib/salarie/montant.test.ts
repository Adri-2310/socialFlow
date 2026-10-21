import { describe, expect, it } from 'vitest';
import { parseEurosToCents } from '@/lib/salarie/montant';

describe('saisie d’un montant en euros', () => {
  it('convertit en centimes entiers', () => {
    expect(parseEurosToCents('2850')).toBe(285000);
    expect(parseEurosToCents('2850,50')).toBe(285050);
    expect(parseEurosToCents('2850.5')).toBe(285050);
    expect(parseEurosToCents('17,25')).toBe(1725);
    expect(parseEurosToCents('0,07')).toBe(7);
    expect(parseEurosToCents('2 850,00 €')).toBe(285000);
  });

  it('ne souffre d’aucune erreur d’arrondi de flottant', () => {
    // 1,15 × 100 vaut 114,99999999999999 en JavaScript : on lit les chiffres tels qu'écrits.
    expect(parseEurosToCents('1,15')).toBe(115);
    expect(parseEurosToCents('19,99')).toBe(1999);
    expect(parseEurosToCents('0,29')).toBe(29);
  });

  it('refuse tout ce qui n’est pas un montant clair', () => {
    for (const texte of [
      '',
      '   ',
      'abc',
      '12,345',
      '-5',
      '2.850,50',
      '12,',
      ',50',
      '1e3',
      '12 euros',
    ]) {
      expect(parseEurosToCents(texte), texte).toBeNull();
    }
  });
});
