// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { exigerBloc } from '@/lib/payroll/bareme/bloc';
import {
  csssSchema,
  parametresBaremeSchema,
  versionBaremeCompleteSchema,
} from '@/lib/payroll/bareme/schema';
import { CSSS_2026_3 } from './fixtures-bareme';

// Le bloc `csss` (étape 6) : forme stricte, entiers, tranches ordonnées, source obligatoire.
describe('bloc csss', () => {
  it('accepte les barèmes du document ONSS 2026/3', () => {
    expect(csssSchema.parse(CSSS_2026_3)).toEqual(CSSS_2026_3);
  });

  it('refuse un montant décimal ou une clé inconnue', () => {
    const tranche = { ...CSSS_2026_3.individuelle[0], fixe: 30.5 };
    expect(csssSchema.safeParse({ ...CSSS_2026_3, individuelle: [tranche] }).success).toBe(false);
    expect(csssSchema.safeParse({ ...CSSS_2026_3, couple: [] }).success).toBe(false);
  });

  it('refuse des tranches désordonnées, vides ou avec un plancher au-dessus du plafond', () => {
    const [t0, t1] = CSSS_2026_3.individuelle;
    expect(csssSchema.safeParse({ ...CSSS_2026_3, individuelle: [t1, t0] }).success).toBe(false);
    expect(csssSchema.safeParse({ ...CSSS_2026_3, individuelle: [] }).success).toBe(false);
    expect(
      csssSchema.safeParse({
        ...CSSS_2026_3,
        individuelle: [{ ...t0, plancher: 500, plafond: 100 }],
      }).success,
    ).toBe(false);
  });

  it('lève PARAMETRE_MANQUANT quand le barème n’a pas de bloc csss', () => {
    const parametres = parametresBaremeSchema.parse({
      version: 1,
      categorieEmployeur: 'PRIVE_MARCHAND',
    });
    expect(() => exigerBloc(parametres, 'csss')).toThrow(/csss/);
  });

  it('exige sa source dans une version complète', () => {
    const base = {
      code: 'BE-2026-09',
      valideDepuis: '2026-09-01',
      valideJusqua: null,
      statut: 'A_VERIFIER' as const,
      categorieEmployeur: 'PRIVE_MARCHAND',
      parametres: {
        version: 1 as const,
        categorieEmployeur: 'PRIVE_MARCHAND',
        csss: CSSS_2026_3,
      },
    };
    const source = {
      document: 'Instructions administratives ONSS',
      reference: 'La cotisation spéciale pour la sécurité sociale',
      versionDocument: '2026/3',
      consulteLe: '2026-10-29',
    };
    expect(
      versionBaremeCompleteSchema.safeParse({ ...base, source: { csss: source } }).success,
    ).toBe(true);
    expect(versionBaremeCompleteSchema.safeParse({ ...base, source: {} }).success).toBe(false);
  });
});
