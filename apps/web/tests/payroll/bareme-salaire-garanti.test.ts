// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { exigerBloc } from '@/lib/payroll/bareme/bloc';
import {
  parametresBaremeSchema,
  salaireGarantiSchema,
  versionBaremeCompleteSchema,
} from '@/lib/payroll/bareme/schema';
import { SALAIRE_GARANTI_2026 } from './fixtures-bareme';

// Le bloc `salaireGaranti` (étape 8b, D108).
describe('bloc salaireGaranti', () => {
  it('accepte les durées de la loi du 3 juillet 1978', () => {
    expect(salaireGarantiSchema.parse(SALAIRE_GARANTI_2026)).toEqual(SALAIRE_GARANTI_2026);
  });

  it('refuse un taux ou un plafond décimal ou négatif, un champ manquant ou une clé inconnue', () => {
    const s = SALAIRE_GARANTI_2026;
    expect(salaireGarantiSchema.safeParse({ ...s, tauxPartiel: 600_000.5 }).success).toBe(false);
    expect(
      salaireGarantiSchema.safeParse({ ...s, plafondJournalierDixMilliemes: -1 }).success,
    ).toBe(false);
    expect(salaireGarantiSchema.safeParse({ ...s, employeLongueDureeJours: 30.5 }).success).toBe(
      false,
    );
    expect(
      salaireGarantiSchema.safeParse({ ...s, complementOuvrierPlafonne: 258_800.5 }).success,
    ).toBe(false);
    expect(salaireGarantiSchema.safeParse({ ...s, complementJours: 23.5 }).success).toBe(false);
    const { complementJours: _jours, ...sansComplement } = s;
    expect(salaireGarantiSchema.safeParse(sansComplement).success).toBe(false);
    const { plafondJournalierDixMilliemes: _plafond, ...sansPlafond } = s;
    expect(salaireGarantiSchema.safeParse(sansPlafond).success).toBe(false);
    expect(salaireGarantiSchema.safeParse({ ...s, mutuelle: 1 }).success).toBe(false);
  });

  it('lève PARAMETRE_MANQUANT quand le bloc est absent', () => {
    const parametres = parametresBaremeSchema.parse({
      version: 1,
      categorieEmployeur: 'PRIVE_MARCHAND',
    });
    expect(() => exigerBloc(parametres, 'salaireGaranti')).toThrow(/salaireGaranti/);
  });

  it('exige une source dans une version complète', () => {
    const base = {
      code: 'BE-2026-09',
      valideDepuis: '2026-09-01',
      valideJusqua: null,
      statut: 'A_VERIFIER' as const,
      categorieEmployeur: 'PRIVE_MARCHAND',
      parametres: {
        version: 1 as const,
        categorieEmployeur: 'PRIVE_MARCHAND',
        salaireGaranti: SALAIRE_GARANTI_2026,
      },
    };
    const source = {
      salaireGaranti: {
        document: 'Loi du 3 juillet 1978 relative aux contrats de travail',
        reference: 'art. 52, 54, 70, 71, 72',
        versionDocument: 'version consolidée Justel au 15/06/2026',
        consulteLe: '2026-10-29',
      },
    };
    expect(versionBaremeCompleteSchema.safeParse({ ...base, source }).success).toBe(true);
    expect(versionBaremeCompleteSchema.safeParse({ ...base, source: {} }).success).toBe(false);
  });
});
