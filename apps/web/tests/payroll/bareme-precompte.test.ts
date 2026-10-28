// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { precompteSchema, versionBaremeCompleteSchema } from '@/lib/payroll/bareme/schema';
import { PRECOMPTE_2026 } from './fixtures-bareme';

// Le bloc `precompte` (étape 5) : forme stricte, entiers, barème ordonné, source obligatoire.
describe('bloc precompte', () => {
  it("accepte les valeurs de l'Annexe III 2026", () => {
    expect(precompteSchema.parse(PRECOMPTE_2026)).toEqual(PRECOMPTE_2026);
  });

  it('refuse un montant décimal ou une clé inconnue', () => {
    const frais = { ...PRECOMPTE_2026.fraisProfessionnels, maximum: 6_070.5 };
    expect(
      precompteSchema.safeParse({ ...PRECOMPTE_2026, fraisProfessionnels: frais }).success,
    ).toBe(false);
    expect(precompteSchema.safeParse({ ...PRECOMPTE_2026, quotiteExemptee: 1 }).success).toBe(
      false,
    );
  });

  it('refuse un barème qui ne commence pas à 0 ou dont les seuils ne croissent pas', () => {
    const [premiere, deuxieme, ...reste] = PRECOMPTE_2026.bareme;
    const decale = [{ ...premiere, auDela: 1 }, deuxieme, ...reste];
    expect(precompteSchema.safeParse({ ...PRECOMPTE_2026, bareme: decale }).success).toBe(false);
    const desordre = [premiere, { ...deuxieme, auDela: 0 }, ...reste];
    expect(precompteSchema.safeParse({ ...PRECOMPTE_2026, bareme: desordre }).success).toBe(false);
    expect(precompteSchema.safeParse({ ...PRECOMPTE_2026, bareme: [] }).success).toBe(false);
  });

  it('exige exactement 8 réductions pour enfants', () => {
    const reductions = { ...PRECOMPTE_2026.reductions, enfants: [62_400, 165_600] };
    expect(precompteSchema.safeParse({ ...PRECOMPTE_2026, reductions }).success).toBe(false);
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
        precompte: PRECOMPTE_2026,
      },
    };
    const source = {
      document: "Annexe III à l'AR/CIR 92",
      reference: 'n° 27 à 46',
      versionDocument: 'AR du 11/12/2025',
      consulteLe: '2026-10-26',
    };
    expect(
      versionBaremeCompleteSchema.safeParse({ ...base, source: { precompte: source } }).success,
    ).toBe(true);
    expect(versionBaremeCompleteSchema.safeParse({ ...base, source: {} }).success).toBe(false);
  });
});
