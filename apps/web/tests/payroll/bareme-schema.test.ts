// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  montantCentimesSchema,
  sourceBlocSchema,
  tauxSchema,
  versionBaremeCompleteSchema,
} from '@/lib/payroll/bareme/schema';

// Version minimale valide : aucune valeur légale à ce stade (étape 2), seulement l'ossature.
const valide = () => ({
  code: 'TEST-0001',
  valideDepuis: '2026-01-01',
  valideJusqua: null as string | null,
  statut: 'A_VERIFIER',
  categorieEmployeur: 'PRIVE_MARCHAND',
  parametres: { version: 1, categorieEmployeur: 'PRIVE_MARCHAND' } as Record<string, unknown>,
  source: {} as Record<string, unknown>,
});

const source = {
  document: 'Document de test',
  reference: 'n° 1',
  versionDocument: '2026/1',
  consulteLe: '2026-10-28',
};

describe('versionBaremeCompleteSchema', () => {
  it('accepte une version minimale', () => {
    expect(versionBaremeCompleteSchema.safeParse(valide()).success).toBe(true);
  });

  it('refuse une clé inconnue dans les paramètres', () => {
    const v = valide();
    v.parametres.tauxInvente = 1;
    expect(versionBaremeCompleteSchema.safeParse(v).success).toBe(false);
  });

  it('refuse une catégorie des paramètres différente de celle de la version', () => {
    const v = valide();
    v.parametres.categorieEmployeur = 'AUTRE';
    expect(versionBaremeCompleteSchema.safeParse(v).success).toBe(false);
  });

  it('refuse un statut inconnu et une catégorie mal formée', () => {
    expect(versionBaremeCompleteSchema.safeParse({ ...valide(), statut: 'BROUILLON' }).success).toBe(
      false,
    );
    expect(
      versionBaremeCompleteSchema.safeParse({ ...valide(), categorieEmployeur: 'prive marchand' })
        .success,
    ).toBe(false);
  });

  it('refuse une fin de validité antérieure au début', () => {
    const v = { ...valide(), valideJusqua: '2025-12-31' };
    expect(versionBaremeCompleteSchema.safeParse(v).success).toBe(false);
  });

  it('refuse une date impossible', () => {
    expect(versionBaremeCompleteSchema.safeParse({ ...valide(), valideDepuis: '2026-02-30' }).success)
      .toBe(false);
  });

  it('refuse une source sans bloc de paramètres', () => {
    const v = valide();
    v.source.onss = source;
    expect(versionBaremeCompleteSchema.safeParse(v).success).toBe(false);
  });

  it('refuse une source dont un champ est vide ou dont la date est invalide', () => {
    expect(sourceBlocSchema.safeParse(source).success).toBe(true);
    expect(sourceBlocSchema.safeParse({ ...source, document: '  ' }).success).toBe(false);
    expect(sourceBlocSchema.safeParse({ ...source, consulteLe: '28/10/2026' }).success).toBe(false);
    expect(sourceBlocSchema.safeParse({ ...source, extra: 1 }).success).toBe(false);
  });
});

describe('montants et taux', () => {
  it('acceptent des entiers et refusent les flottants et les négatifs', () => {
    expect(montantCentimesSchema.safeParse(123456).success).toBe(true);
    expect(montantCentimesSchema.safeParse(0).success).toBe(true);
    expect(montantCentimesSchema.safeParse(12.5).success).toBe(false);
    expect(montantCentimesSchema.safeParse(-1).success).toBe(false);
    expect(tauxSchema.safeParse(267_500).success).toBe(true);
    expect(tauxSchema.safeParse(0.2675).success).toBe(false);
  });

  it('refusent un taux déraisonnable (plus de 10 fois 100 %)', () => {
    expect(tauxSchema.safeParse(10_000_000).success).toBe(true);
    expect(tauxSchema.safeParse(10_000_001).success).toBe(false);
  });
});
