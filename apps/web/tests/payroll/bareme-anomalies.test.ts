// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { exigerBloc } from '@/lib/payroll/bareme/bloc';
import { anomaliesSchema, parametresBaremeSchema } from '@/lib/payroll/bareme/schema';
import { ANOMALIES_2026 } from './fixtures-bareme';

// Le bloc `anomalies` (étape 8d, D105).
describe('bloc anomalies', () => {
  it('accepte le seuil de 25 %', () => {
    expect(anomaliesSchema.parse(ANOMALIES_2026)).toEqual(ANOMALIES_2026);
  });

  it('refuse un seuil décimal, démesuré ou une clé inconnue', () => {
    expect(anomaliesSchema.safeParse({ ecartNetMoisPrecedent: 250_000.5 }).success).toBe(false);
    expect(anomaliesSchema.safeParse({ ecartNetMoisPrecedent: 99_000_000 }).success).toBe(false);
    expect(anomaliesSchema.safeParse({ ...ANOMALIES_2026, ecartBrut: 1 }).success).toBe(false);
  });

  it('lève PARAMETRE_MANQUANT quand le bloc est absent', () => {
    const parametres = parametresBaremeSchema.parse({
      version: 1,
      categorieEmployeur: 'PRIVE_MARCHAND',
    });
    expect(() => exigerBloc(parametres, 'anomalies')).toThrow(/anomalies/);
  });
});
