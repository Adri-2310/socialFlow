// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import { formaterDuree, formaterFraction, formaterJours } from '@/lib/payroll/format';
import { fractionOccupation } from '@/lib/payroll/occupation';

const partiel = (semaine: number | null, reference: number | null) => ({
  regime: 'TEMPS_PARTIEL' as const,
  heuresSemaineMinutes: semaine,
  heuresReferenceMinutes: reference,
});

describe('fractionOccupation', () => {
  it('vaut 1/1 à temps plein, quelles que soient les heures enregistrées', () => {
    const attendu = { numerateur: 1, denominateur: 1 };
    expect(
      fractionOccupation({
        regime: 'TEMPS_PLEIN',
        heuresSemaineMinutes: null,
        heuresReferenceMinutes: null,
      }),
    ).toEqual(attendu);
    expect(
      fractionOccupation({
        regime: 'TEMPS_PLEIN',
        heuresSemaineMinutes: 2_280,
        heuresReferenceMinutes: 2_280,
      }),
    ).toEqual(attendu);
  });

  it('réduit la fraction : 30 h 24 sur 38 h = 4/5, 19 h sur 38 h = 1/2', () => {
    expect(fractionOccupation(partiel(1_824, 2_280))).toEqual({ numerateur: 4, denominateur: 5 });
    expect(fractionOccupation(partiel(1_140, 2_280))).toEqual({ numerateur: 1, denominateur: 2 });
  });

  it('admet un temps partiel égal à la référence', () => {
    expect(fractionOccupation(partiel(2_280, 2_280))).toEqual({ numerateur: 1, denominateur: 1 });
  });

  it('refuse un temps partiel sans heures', () => {
    expect(() => fractionOccupation(partiel(null, 2_280))).toThrow(ErreurMoteur);
    expect(() => fractionOccupation(partiel(1_824, null))).toThrow(ErreurMoteur);
  });

  it('refuse des heures nulles, flottantes ou au-delà de 60 h par semaine', () => {
    expect(() => fractionOccupation(partiel(0, 2_280))).toThrow(ErreurMoteur);
    expect(() => fractionOccupation(partiel(1_824.5, 2_280))).toThrow(ErreurMoteur);
    expect(() => fractionOccupation(partiel(1_824, 3_601))).toThrow(ErreurMoteur);
  });

  it('refuse un temps partiel supérieur à la personne de référence', () => {
    expect(() => fractionOccupation(partiel(2_400, 2_280))).toThrow(ErreurMoteur);
  });
});

describe('formats des libellés', () => {
  it('formate une durée, des jours et une fraction', () => {
    expect(formaterDuree(1_824)).toBe('30 h 24');
    expect(formaterDuree(65)).toBe('1 h 05');
    expect(formaterJours(1)).toBe('0,5 jour');
    expect(formaterJours(2)).toBe('1 jour');
    expect(formaterJours(3)).toBe('1,5 jours');
    expect(formaterJours(4)).toBe('2 jours');
    expect(formaterFraction({ numerateur: 4, denominateur: 5 })).toBe('4/5');
  });
});
