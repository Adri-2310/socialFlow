// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { exigerBloc } from '@/lib/payroll/bareme/bloc';
import {
  cotisationsPatronalesSchema,
  parametresBaremeSchema,
  reductionStructurelleSchema,
  versionBaremeCompleteSchema,
} from '@/lib/payroll/bareme/schema';
import { COTISATIONS_PATRONALES_2026_3, REDUCTION_STRUCTURELLE_2026_3 } from './fixtures-bareme';

// Les blocs `cotisationsPatronales` et `reductionStructurelle` (étape 7).
describe('bloc cotisationsPatronales', () => {
  it('accepte les taux du document ONSS 2026/3', () => {
    expect(cotisationsPatronalesSchema.parse(COTISATIONS_PATRONALES_2026_3)).toEqual(
      COTISATIONS_PATRONALES_2026_3,
    );
  });

  it('refuse un taux décimal, un taux démesuré ou une clé inconnue', () => {
    const c = COTISATIONS_PATRONALES_2026_3;
    expect(cotisationsPatronalesSchema.safeParse({ ...c, tauxBase: 198_800.5 }).success).toBe(
      false,
    );
    expect(cotisationsPatronalesSchema.safeParse({ ...c, tauxBase: 99_000_000 }).success).toBe(
      false,
    );
    expect(cotisationsPatronalesSchema.safeParse({ ...c, ffe: 100 }).success).toBe(false);
  });
});

describe('bloc reductionStructurelle', () => {
  it('accepte les valeurs du document ONSS 2026/3', () => {
    expect(reductionStructurelleSchema.parse(REDUCTION_STRUCTURELLE_2026_3)).toEqual(
      REDUCTION_STRUCTURELLE_2026_3,
    );
  });

  it('refuse des seuils de prestations désordonnés', () => {
    const r = REDUCTION_STRUCTURELLE_2026_3;
    expect(reductionStructurelleSchema.safeParse({ ...r, debutProgression: 900_000 }).success).toBe(
      false,
    );
    expect(
      reductionStructurelleSchema.safeParse({ ...r, plancherPrestations: 600_000 }).success,
    ).toBe(false);
  });
});

describe('blocs patronaux dans une version de barème', () => {
  it('lève PARAMETRE_MANQUANT quand un bloc est absent', () => {
    const parametres = parametresBaremeSchema.parse({
      version: 1,
      categorieEmployeur: 'PRIVE_MARCHAND',
    });
    expect(() => exigerBloc(parametres, 'cotisationsPatronales')).toThrow(/cotisationsPatronales/);
    expect(() => exigerBloc(parametres, 'reductionStructurelle')).toThrow(/reductionStructurelle/);
  });

  it('exige une source pour chaque bloc', () => {
    const base = {
      code: 'BE-2026-09',
      valideDepuis: '2026-09-01',
      valideJusqua: null,
      statut: 'A_VERIFIER' as const,
      categorieEmployeur: 'PRIVE_MARCHAND',
      parametres: {
        version: 1 as const,
        categorieEmployeur: 'PRIVE_MARCHAND',
        cotisationsPatronales: COTISATIONS_PATRONALES_2026_3,
        reductionStructurelle: REDUCTION_STRUCTURELLE_2026_3,
      },
    };
    const source = (reference: string) => ({
      document: 'Instructions administratives ONSS',
      reference,
      versionDocument: '2026/3',
      consulteLe: '2026-10-29',
    });
    const sources = {
      cotisationsPatronales: source('pp. 174-177'),
      reductionStructurelle: source('pp. 374-383'),
    };
    expect(versionBaremeCompleteSchema.safeParse({ ...base, source: sources }).success).toBe(true);
    expect(
      versionBaremeCompleteSchema.safeParse({
        ...base,
        source: { cotisationsPatronales: sources.cotisationsPatronales },
      }).success,
    ).toBe(false);
  });
});
