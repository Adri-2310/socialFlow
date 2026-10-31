// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { exigerBloc } from '@/lib/payroll/bareme/bloc';
import {
  heuresSupplementairesSchema,
  parametresBaremeSchema,
  versionBaremeCompleteSchema,
} from '@/lib/payroll/bareme/schema';
import { HEURES_SUPPLEMENTAIRES_2026 } from './fixtures-bareme';

// Le bloc `heuresSupplementaires` (étape 8c, D106).
describe('bloc heuresSupplementaires', () => {
  it('accepte les valeurs du dossier de référence', () => {
    expect(heuresSupplementairesSchema.parse(HEURES_SUPPLEMENTAIRES_2026)).toEqual(
      HEURES_SUPPLEMENTAIRES_2026,
    );
  });

  it('refuse un plafond sans sursalaire supérieur au plafond des heures volontaires', () => {
    const h = HEURES_SUPPLEMENTAIRES_2026;
    expect(
      heuresSupplementairesSchema.safeParse({ ...h, plafondSansSursalaireMinutes: 21_601 }).success,
    ).toBe(false);
  });

  it('refuse un taux décimal, des minutes décimales ou une clé inconnue', () => {
    const h = HEURES_SUPPLEMENTAIRES_2026;
    expect(heuresSupplementairesSchema.safeParse({ ...h, tauxReduction: 577_500.5 }).success).toBe(
      false,
    );
    expect(
      heuresSupplementairesSchema.safeParse({ ...h, plafondReductionMinutes: 7_800.5 }).success,
    ).toBe(false);
    expect(heuresSupplementairesSchema.safeParse({ ...h, horeca: 1 }).success).toBe(false);
  });

  it('lève PARAMETRE_MANQUANT quand le bloc est absent', () => {
    const parametres = parametresBaremeSchema.parse({
      version: 1,
      categorieEmployeur: 'PRIVE_MARCHAND',
    });
    expect(() => exigerBloc(parametres, 'heuresSupplementaires')).toThrow(/heuresSupplementaires/);
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
        heuresSupplementaires: HEURES_SUPPLEMENTAIRES_2026,
      },
    };
    const source = {
      heuresSupplementaires: {
        document: 'Loi du 16 mars 1971 art. 25bis ; Annexe III n° 45',
        reference: 'DOC 56 1333/007 ; n° 45',
        versionDocument: 'texte adopté 30/04/2026 ; AR du 11/12/2025',
        consulteLe: '2026-10-29',
      },
    };
    expect(versionBaremeCompleteSchema.safeParse({ ...base, source }).success).toBe(true);
    expect(versionBaremeCompleteSchema.safeParse({ ...base, source: {} }).success).toBe(false);
  });
});
