import { describe, expect, it } from 'vitest';
import { bornesDuMois } from '@/lib/periode/periode-dates';
import { estNeutre, prestationSchema, type PrestationInput } from '@/lib/schemas/prestation';
import { invalidFields } from '@/lib/schemas/salarie';

describe('bornesDuMois', () => {
  it('donne le premier et le dernier jour, et le nombre de jours', () => {
    expect(bornesDuMois(2026, 10)).toEqual({
      premier: '2026-10-01',
      dernier: '2026-10-31',
      joursDansMois: 31,
    });
    expect(bornesDuMois(2026, 11).dernier).toBe('2026-11-30');
  });

  it('connaît février, année bissextile comprise', () => {
    expect(bornesDuMois(2027, 2).joursDansMois).toBe(28);
    expect(bornesDuMois(2028, 2).joursDansMois).toBe(29);
    expect(bornesDuMois(2028, 2).dernier).toBe('2028-02-29');
  });
});

// D92 : chaque valeur est bornée au nombre de jours ou d'heures du mois de la période.
describe('prestationSchema', () => {
  const schema = prestationSchema(2026, 11); // 30 jours

  it('complète un corps vide avec « aucun écart »', () => {
    const result = schema.parse({});
    expect(result).toEqual({
      heuresPresteesMinutes: null,
      congeDemiJours: 0,
      maladieDemiJours: 0,
      ferieDemiJours: 0,
      absenceNonRemDemiJours: 0,
      heuresSupMinutes: 0,
      primeCents: null,
      primeLibelle: null,
    });
    expect(estNeutre(result)).toBe(true);
  });

  it('accepte des valeurs valides, demi-journées et prime comprises', () => {
    const result = schema.parse({
      heuresPresteesMinutes: 7 * 60 + 30,
      congeDemiJours: 3,
      maladieDemiJours: 1,
      ferieDemiJours: 2,
      absenceNonRemDemiJours: 1,
      heuresSupMinutes: 90,
      primeCents: 15000,
      primeLibelle: '  Prime de fin d’année ',
    });
    expect(result.congeDemiJours).toBe(3);
    // Le libellé est nettoyé de ses espaces.
    expect(result.primeLibelle).toBe('Prime de fin d’année');
    expect(estNeutre(result)).toBe(false);
  });

  it('borne les jours au nombre de jours du mois (2 demi-journées par jour)', () => {
    expect(schema.safeParse({ congeDemiJours: 60 }).success).toBe(true);
    expect(schema.safeParse({ congeDemiJours: 61 }).success).toBe(false);
    // Février 2027 : 28 jours.
    const fevrier = prestationSchema(2027, 2);
    expect(fevrier.safeParse({ maladieDemiJours: 56 }).success).toBe(true);
    expect(fevrier.safeParse({ maladieDemiJours: 57 }).success).toBe(false);
  });

  it('borne les heures au nombre d’heures du mois', () => {
    expect(schema.safeParse({ heuresSupMinutes: 30 * 24 * 60 }).success).toBe(true);
    expect(schema.safeParse({ heuresSupMinutes: 30 * 24 * 60 + 1 }).success).toBe(false);
    expect(schema.safeParse({ heuresPresteesMinutes: 30 * 24 * 60 + 1 }).success).toBe(false);
  });

  it.each([
    ['négatif', { congeDemiJours: -1 }],
    ['décimal', { congeDemiJours: 1.5 }],
    ['texte', { ferieDemiJours: '2' }],
    ['heures décimales', { heuresSupMinutes: 10.5 }],
    ['prime nulle', { primeCents: 0, primeLibelle: 'x' }],
    ['prime décimale', { primeCents: 10.5, primeLibelle: 'x' }],
    ['prime démesurée', { primeCents: 100_000_001, primeLibelle: 'x' }],
    ['libellé vide', { primeCents: 100, primeLibelle: '   ' }],
    ['libellé trop long', { primeCents: 100, primeLibelle: 'x'.repeat(61) }],
  ])('refuse une valeur invalide : %s', (_nom, corps) => {
    expect(schema.safeParse(corps).success).toBe(false);
  });

  it('exige ensemble le montant et le libellé de la prime', () => {
    const sansLibelle = schema.safeParse({ primeCents: 5000 });
    expect(sansLibelle.success).toBe(false);
    if (!sansLibelle.success) {
      expect(invalidFields(sansLibelle.error)).toEqual({ primeLibelle: 'INVALID_PRIME_LIBELLE' });
    }
    const sansMontant = schema.safeParse({ primeLibelle: 'Prime' });
    expect(sansMontant.success).toBe(false);
    if (!sansMontant.success) {
      expect(invalidFields(sansMontant.error)).toEqual({ primeCents: 'INVALID_PRIME_CENTS' });
    }
  });
});

describe('estNeutre', () => {
  const neutre: PrestationInput = {
    heuresPresteesMinutes: null,
    congeDemiJours: 0,
    maladieDemiJours: 0,
    ferieDemiJours: 0,
    absenceNonRemDemiJours: 0,
    heuresSupMinutes: 0,
    primeCents: null,
    primeLibelle: null,
  };

  it('reconnaît l’absence d’écart', () => {
    expect(estNeutre(neutre)).toBe(true);
  });

  it.each(Object.keys(neutre).map((champ) => [champ]))(
    'un écart sur %s n’est pas neutre',
    (champ) => {
      const valeur = champ === 'primeLibelle' ? 'x' : 1;
      expect(estNeutre({ ...neutre, [champ]: valeur })).toBe(false);
    },
  );

  it('une durée à zéro minute n’est pas « aucune durée » (heures prestées facultatives)', () => {
    expect(estNeutre({ ...neutre, heuresPresteesMinutes: 0 })).toBe(false);
  });
});
