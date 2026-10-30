import { describe, expect, it } from 'vitest';
import {
  dateLimiteParDefaut,
  moisBruxelles,
  moisOuvrable,
  moisProposes,
  PREMIER_MOIS_PAIE,
  premierMoisOuvrable,
  refusBorneBasse,
} from '@/lib/periode/periode-dates';

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

// D114 : bornes basses des périodes de paie.
describe('moisBruxelles', () => {
  it('prend le mois civil en heure de Bruxelles, pas en UTC', () => {
    // fin octobre 2026 : heure d'hiver (UTC+1) ; 23 h 30 UTC = 00 h 30 le 1er novembre
    expect(moisBruxelles(new Date('2026-10-31T23:30:00Z'))).toEqual({ annee: 2026, mois: 11 });
    expect(moisBruxelles(new Date('2026-10-31T21:30:00Z'))).toEqual({ annee: 2026, mois: 10 });
    // heure d'été (UTC+2) : 22 h 30 UTC le 30 juin = 00 h 30 le 1er juillet
    expect(moisBruxelles(new Date('2026-06-30T22:30:00Z'))).toEqual({ annee: 2026, mois: 7 });
    expect(moisBruxelles(new Date('2026-06-30T21:30:00Z'))).toEqual({ annee: 2026, mois: 6 });
  });
});

describe('premierMoisOuvrable', () => {
  it('le début de la paie (septembre 2026) quand l’entreprise est plus ancienne', () => {
    expect(PREMIER_MOIS_PAIE).toEqual({ annee: 2026, mois: 9 });
    expect(premierMoisOuvrable(new Date('2025-03-10T10:00:00Z'))).toEqual({ annee: 2026, mois: 9 });
    expect(premierMoisOuvrable(new Date('2026-09-15T10:00:00Z'))).toEqual({ annee: 2026, mois: 9 });
  });

  it('le mois d’inscription, ce mois compris, quand l’entreprise est plus récente', () => {
    expect(premierMoisOuvrable(new Date('2026-10-28T10:00:00Z'))).toEqual({
      annee: 2026,
      mois: 10,
    });
    expect(premierMoisOuvrable(new Date('2027-02-01T10:00:00Z'))).toEqual({ annee: 2027, mois: 2 });
  });

  it('compte le mois d’inscription à l’heure de Bruxelles', () => {
    expect(premierMoisOuvrable(new Date('2026-10-31T23:30:00Z'))).toEqual({
      annee: 2026,
      mois: 11,
    });
  });
});

describe('refusBorneBasse', () => {
  const ancienne = new Date('2025-01-01T10:00:00Z');
  const octobre = new Date('2026-10-28T10:00:00Z');

  it('refuse un mois avant le début de la paie, quelle que soit l’inscription', () => {
    expect(refusBorneBasse(2026, 8, ancienne)).toBe('AVANT_DEBUT_PAIE');
    expect(refusBorneBasse(2025, 12, ancienne)).toBe('AVANT_DEBUT_PAIE');
    expect(refusBorneBasse(2026, 8, octobre)).toBe('AVANT_DEBUT_PAIE');
  });

  it('accepte septembre 2026 pour une entreprise plus ancienne', () => {
    expect(refusBorneBasse(2026, 9, ancienne)).toBeNull();
    expect(refusBorneBasse(2027, 3, ancienne)).toBeNull();
  });

  it('refuse un mois avant l’inscription, accepte le mois d’inscription et les suivants', () => {
    expect(refusBorneBasse(2026, 9, octobre)).toBe('AVANT_INSCRIPTION');
    expect(refusBorneBasse(2026, 10, octobre)).toBeNull();
    expect(refusBorneBasse(2026, 11, octobre)).toBeNull();
  });

  it('refuse le mois précédant une inscription faite à minuit passé, à l’heure de Bruxelles', () => {
    const minuitBruxelles = new Date('2026-10-31T23:30:00Z');
    expect(refusBorneBasse(2026, 10, minuitBruxelles)).toBe('AVANT_INSCRIPTION');
    expect(refusBorneBasse(2026, 11, minuitBruxelles)).toBeNull();
  });
});

describe('moisProposes avec une borne basse', () => {
  const aujourdhui = new Date('2026-10-30T10:00:00Z');

  it('s’arrête au premier mois ouvrable : septembre 2026 pour une entreprise plus ancienne', () => {
    const mois = moisProposes(
      aujourdhui,
      [],
      24,
      premierMoisOuvrable(new Date('2025-01-01T10:00:00Z')),
    );
    expect(mois).toEqual([
      { annee: 2026, mois: 11 },
      { annee: 2026, mois: 10 },
      { annee: 2026, mois: 9 },
    ]);
  });

  it('s’arrête au mois d’inscription pour une entreprise plus récente', () => {
    const mois = moisProposes(
      aujourdhui,
      [],
      24,
      premierMoisOuvrable(new Date('2026-10-28T10:00:00Z')),
    );
    expect(mois).toEqual([
      { annee: 2026, mois: 11 },
      { annee: 2026, mois: 10 },
    ]);
  });

  it('sans borne, garde le comportement de D90', () => {
    expect(moisProposes(aujourdhui, [], 4)).toHaveLength(4);
  });
});
