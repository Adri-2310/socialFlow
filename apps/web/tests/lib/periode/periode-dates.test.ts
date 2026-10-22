import { describe, expect, it } from 'vitest';
import { dateLimiteParDefaut, moisOuvrable } from '@/lib/periode/periode-dates';

// D90 : une période s'ouvre pour tout mois passé, le mois courant et le mois suivant.
describe('moisOuvrable', () => {
  const aujourdhui = new Date('2026-10-22T10:00:00Z');

  it('accepte le mois courant et le mois suivant', () => {
    expect(moisOuvrable(2026, 10, aujourdhui)).toBe(true);
    expect(moisOuvrable(2026, 11, aujourdhui)).toBe(true);
  });

  it('accepte les mois passés, y compris ceux des années précédentes (rattrapage)', () => {
    expect(moisOuvrable(2026, 9, aujourdhui)).toBe(true);
    expect(moisOuvrable(2026, 1, aujourdhui)).toBe(true);
    expect(moisOuvrable(2024, 12, aujourdhui)).toBe(true);
  });

  it('refuse le deuxième mois suivant et au-delà', () => {
    expect(moisOuvrable(2026, 12, aujourdhui)).toBe(false);
    expect(moisOuvrable(2027, 1, aujourdhui)).toBe(false);
    expect(moisOuvrable(2030, 5, aujourdhui)).toBe(false);
  });

  it('passe correctement le cap de décembre à janvier', () => {
    const decembre = new Date('2026-12-15T10:00:00Z');
    expect(moisOuvrable(2027, 1, decembre)).toBe(true);
    expect(moisOuvrable(2027, 2, decembre)).toBe(false);
  });
});

// D91 : le jour limite tombe dans le mois de la période.
describe('dateLimiteParDefaut', () => {
  it('pose le jour réglé dans le mois de la période', () => {
    expect(dateLimiteParDefaut(2026, 11, 20)).toBe('2026-11-20');
  });

  it('complète le mois et le jour sur deux chiffres', () => {
    expect(dateLimiteParDefaut(2026, 3, 5)).toBe('2026-03-05');
  });

  it('existe dans tous les mois, février compris (jour 28 au plus)', () => {
    expect(dateLimiteParDefaut(2027, 2, 28)).toBe('2027-02-28');
  });
});
