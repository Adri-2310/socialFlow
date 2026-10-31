// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { joursDuMois, lireDate, numeroDeJour } from '@/lib/payroll/calendrier';
import { ErreurMoteur } from '@/lib/payroll/erreurs';

describe('numeroDeJour', () => {
  it('le 1er janvier 1970 vaut 0, le lendemain 1', () => {
    expect(numeroDeJour('d', '1970-01-01')).toBe(0);
    expect(numeroDeJour('d', '1970-01-02')).toBe(1);
  });

  it('compte les jours entre deux dates, février compris', () => {
    // février 2026 : 28 jours ; février 2024 (bissextile) : 29 jours
    expect(numeroDeJour('d', '2026-03-01') - numeroDeJour('d', '2026-02-01')).toBe(28);
    expect(numeroDeJour('d', '2024-03-01') - numeroDeJour('d', '2024-02-01')).toBe(29);
    // 2026 compte 365 jours
    expect(numeroDeJour('d', '2027-01-01') - numeroDeJour('d', '2026-01-01')).toBe(365);
    // 2100 n'est pas bissextile : mars suit février de 28 jours
    expect(numeroDeJour('d', '2100-03-01') - numeroDeJour('d', '2100-02-01')).toBe(28);
  });

  it('du 2 mars au 1er avril 2026 : 30 jours d’écart', () => {
    expect(numeroDeJour('d', '2026-04-01') - numeroDeJour('d', '2026-03-02')).toBe(30);
  });
});

describe('lireDate / joursDuMois', () => {
  it('lit une date valide', () => {
    expect(lireDate('d', '2026-05-14')).toEqual({ annee: 2026, mois: 5, jour: 14 });
  });

  it('refuse un jour inexistant ou un autre format', () => {
    for (const d of ['2026-02-30', '2026-13-01', '2026-1-1', '14/05/2026', '2026-00-10', '']) {
      expect(() => lireDate('d', d)).toThrow(ErreurMoteur);
    }
    expect(() => lireDate('d', 20260514 as unknown as string)).toThrow(ErreurMoteur);
  });

  it('février a 29 jours en 2024 et 28 en 2026', () => {
    expect(joursDuMois(2024, 2)).toBe(29);
    expect(joursDuMois(2026, 2)).toBe(28);
    expect(joursDuMois(2026, 4)).toBe(30);
    expect(joursDuMois(2026, 12)).toBe(31);
  });
});
