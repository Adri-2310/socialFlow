import { describe, expect, it } from 'vitest';
import { formatIban, isValidIban, normalizeIban } from '@/lib/salarie/iban';
import { formatNiss, isValidNiss, normalizeNiss } from '@/lib/salarie/niss';

describe('NISS', () => {
  it('accepte un NISS valide, avec ou sans séparateurs', () => {
    expect(isValidNiss('85073003328')).toBe(true);
    expect(isValidNiss('85.07.30-033.28')).toBe(true);
  });

  it('accepte une personne née en 2000 ou après (préfixe 2)', () => {
    expect(isValidNiss('05031512367')).toBe(true);
  });

  it('refuse une mauvaise clé de contrôle', () => {
    expect(isValidNiss('85073003329')).toBe(false);
    expect(isValidNiss('05031512368')).toBe(false);
  });

  it('refuse une longueur ou des caractères invalides', () => {
    expect(isValidNiss('')).toBe(false);
    expect(isValidNiss('8507300332')).toBe(false);
    expect(isValidNiss('850730033288')).toBe(false);
    expect(isValidNiss('8507300332a')).toBe(false);
  });

  it('normalise et formate', () => {
    expect(normalizeNiss('85.07.30-033.28')).toBe('85073003328');
    expect(formatNiss('85073003328')).toBe('85.07.30-033.28');
  });
});

describe('IBAN belge', () => {
  it('accepte un IBAN belge valide, avec ou sans espaces', () => {
    expect(isValidIban('BE68539007547034')).toBe(true);
    expect(isValidIban('be68 5390 0754 7034')).toBe(true);
  });

  it('refuse une clé IBAN erronée', () => {
    expect(isValidIban('BE69539007547034')).toBe(false);
  });

  it('refuse un compte belge dont le contrôle national est faux', () => {
    // Clé IBAN recalculée pour 5390075470 35 : l'IBAN passe ISO mais pas le contrôle belge.
    expect(isValidIban('BE67539007547035')).toBe(false);
  });

  it('refuse un autre pays pour l’instant', () => {
    expect(isValidIban('FR1420041010050500013M02606')).toBe(false);
    expect(isValidIban('NL91ABNA0417164300')).toBe(false);
  });

  it('refuse une longueur ou un format invalide', () => {
    expect(isValidIban('')).toBe(false);
    expect(isValidIban('BE6853900754703')).toBe(false);
    expect(isValidIban('BE685390075470AB')).toBe(false);
  });

  it('normalise et formate', () => {
    expect(normalizeIban('be68 5390 0754 7034')).toBe('BE68539007547034');
    expect(formatIban('BE68539007547034')).toBe('BE68 5390 0754 7034');
  });
});
