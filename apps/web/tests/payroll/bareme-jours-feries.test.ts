// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { exigerBloc } from '@/lib/payroll/bareme/bloc';
import {
  joursFeriesSchema,
  parametresBaremeSchema,
  versionBaremeCompleteSchema,
} from '@/lib/payroll/bareme/schema';
import { JOURS_FERIES_2026 } from './fixtures-bareme';

// Le bloc `joursFeries` (étape 8a, D107).
describe('bloc joursFeries', () => {
  it('accepte la liste de l’arrêté royal du 18 avril 1974', () => {
    expect(joursFeriesSchema.parse(JOURS_FERIES_2026)).toEqual(JOURS_FERIES_2026);
  });

  it('refuse un mois ou un jour impossible, une date listée deux fois ou une clé inconnue', () => {
    const j = JOURS_FERIES_2026;
    expect(joursFeriesSchema.safeParse({ ...j, fixes: [{ mois: 13, jour: 1 }] }).success).toBe(
      false,
    );
    expect(
      joursFeriesSchema.safeParse({
        ...j,
        fixes: [
          { mois: 5, jour: 1 },
          { mois: 5, jour: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(joursFeriesSchema.safeParse({ ...j, apresPaques: [1, 1] }).success).toBe(false);
    expect(joursFeriesSchema.safeParse({ ...j, apresPaques: [0] }).success).toBe(false);
    expect(joursFeriesSchema.safeParse({ ...j, maintienMaladieJours: 30.5 }).success).toBe(false);
    expect(joursFeriesSchema.safeParse({ ...j, carnaval: 1 }).success).toBe(false);
  });

  it('lève PARAMETRE_MANQUANT quand le bloc est absent', () => {
    const parametres = parametresBaremeSchema.parse({
      version: 1,
      categorieEmployeur: 'PRIVE_MARCHAND',
    });
    expect(() => exigerBloc(parametres, 'joursFeries')).toThrow(/joursFeries/);
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
        joursFeries: JOURS_FERIES_2026,
      },
    };
    const source = {
      joursFeries: {
        document: 'Arrêté royal du 18 avril 1974 (jours fériés)',
        reference: 'art. 1 et art. 12',
        versionDocument: 'version consolidée Justel',
        consulteLe: '2026-10-29',
      },
    };
    expect(versionBaremeCompleteSchema.safeParse({ ...base, source }).success).toBe(true);
    expect(versionBaremeCompleteSchema.safeParse({ ...base, source: {} }).success).toBe(false);
  });
});
