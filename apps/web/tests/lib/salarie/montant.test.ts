import { describe, expect, it } from 'vitest';
import { centsToInput, formatCents, parseEurosToCents } from '@/lib/salarie/montant';

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

describe('affichage d’un montant en centimes', () => {
  // L'espace des milliers de Intl est insécable : on le normalise pour comparer.
  const texte = (cents: number) => formatCents(cents).replace(/\s/g, ' ');

  it('formate en euros avec deux décimales', () => {
    expect(texte(285000)).toBe('2 850,00 €');
    expect(texte(1725)).toBe('17,25 €');
    expect(texte(7)).toBe('0,07 €');
    expect(texte(0)).toBe('0,00 €');
    expect(texte(12345678)).toBe('123 456,78 €');
  });

  it('est l’inverse de la saisie', () => {
    for (const cents of [1, 99, 100, 1725, 285000, 99999999]) {
      expect(parseEurosToCents(formatCents(cents))).toBe(cents);
    }
  });
});

describe('valeur d’un champ de saisie', () => {
  it('écrit les centimes comme on les tape, et la saisie se relit à l’identique', () => {
    expect(centsToInput(285000)).toBe('2850,00');
    expect(centsToInput(1725)).toBe('17,25');
    expect(centsToInput(7)).toBe('0,07');
    for (const cents of [1, 99, 100, 1725, 285000, 99999999]) {
      expect(parseEurosToCents(centsToInput(cents))).toBe(cents);
    }
  });
});
