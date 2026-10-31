// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LIMITES_COUT_EMPLOYEUR_ESTIME } from '@/lib/payroll/cout-employeur';

// Le coût employeur est une estimation : la liste de ce qu'il ne contient pas est publiée avec le
// moteur pour que l'écran l'affiche (modules/paie.md § 9 et § 10).
describe('limites du coût employeur estimé', () => {
  it('énumère les cinq éléments non pris en compte, sans doublon', () => {
    const codes = LIMITES_COUT_EMPLOYEUR_ESTIME.map((l) => l.code);
    expect(codes).toEqual([
      'FONDS_FERMETURE',
      'INDEX_CENTIME',
      'DISPENSE_PRECOMPTE_HEURES_SUP',
      'REDUCTION_STRUCTURELLE_TRIMESTRIELLE',
      'AUTRES_CHARGES',
    ]);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('chaque limite a un libellé en français qui se termine par un point', () => {
    for (const l of LIMITES_COUT_EMPLOYEUR_ESTIME) {
      expect(l.libelle.length).toBeGreaterThan(20);
      expect(l.libelle.endsWith('.')).toBe(true);
    }
  });
});
