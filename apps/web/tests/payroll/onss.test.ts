// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { exigerBloc } from '@/lib/payroll/bareme/bloc';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import { calculerCotisationPersonnelle } from '@/lib/payroll/onss';
import { ONSS_2026_09 } from './fixtures-bareme';

// Valeurs attendues calculées à la main (13,07 % ; ouvrier : base à 108 % ; arrondi au centime, la moitié monte).
describe('calculerCotisationPersonnelle', () => {
  it('employé : 13,07 % du brut', () => {
    // 2 500,00 x 13,07 % = 326,75 €
    const r = calculerCotisationPersonnelle(
      { categorie: 'EMPLOYE', brutCentimes: 250_000 },
      ONSS_2026_09,
    );
    expect(r.base).toBe(250_000);
    expect(r.cotisation).toBe(32_675);
    expect(r.lignes).toEqual([
      {
        code: 'COTISATION_PERSONNELLE',
        libelle: 'Cotisation personnelle ONSS',
        base: 250_000,
        taux: 130_700,
        montant: -32_675, // une retenue est négative
      },
    ]);
  });

  it('ouvrier : base majorée de 8 % (exemple 2 du document ONSS, p. 453)', () => {
    // 1 336,00 x 108 % = 1 442,88 ; 1 442,88 x 13,07 % = 188,5844 -> 188,58 €
    const r = calculerCotisationPersonnelle(
      { categorie: 'OUVRIER', brutCentimes: 133_600 },
      ONSS_2026_09,
    );
    expect(r.base).toBe(144_288);
    expect(r.cotisation).toBe(18_858);
    expect(r.lignes[0].montant).toBe(-18_858);
    expect(r.lignes[0].libelle).toContain('majoré de 8 %');
  });

  it('arrondit la moitié vers le haut', () => {
    // 1 250,00 x 13,07 % = 163,375 € exactement -> 163,38 €
    const r = calculerCotisationPersonnelle(
      { categorie: 'EMPLOYE', brutCentimes: 125_000 },
      ONSS_2026_09,
    );
    expect(r.cotisation).toBe(16_338);
  });

  it("arrondit la base à 108 % au centime avant d'appliquer le taux", () => {
    // 10,01 x 108 % = 10,8108 -> 10,81 ; 10,81 x 13,07 % = 1,412867 -> 1,41 €
    const r = calculerCotisationPersonnelle(
      { categorie: 'OUVRIER', brutCentimes: 1_001 },
      ONSS_2026_09,
    );
    expect(r.base).toBe(1_081);
    expect(r.cotisation).toBe(141);
  });

  it('un brut nul ne donne ni cotisation ni ligne', () => {
    const r = calculerCotisationPersonnelle(
      { categorie: 'EMPLOYE', brutCentimes: 0 },
      ONSS_2026_09,
    );
    expect(r.cotisation).toBe(0);
    expect(r.lignes).toEqual([]);
  });

  it('refuse un brut flottant, négatif ou hors bornes, et un statut inconnu', () => {
    const employe = (brutCentimes: number) =>
      calculerCotisationPersonnelle({ categorie: 'EMPLOYE', brutCentimes }, ONSS_2026_09);
    expect(() => employe(1_000.5)).toThrow(ErreurMoteur);
    expect(() => employe(-1)).toThrow(ErreurMoteur);
    expect(() => employe(Number.MAX_SAFE_INTEGER)).toThrow(ErreurMoteur);
    expect(() =>
      calculerCotisationPersonnelle(
        { categorie: 'CADRE' as unknown as 'EMPLOYE', brutCentimes: 1_000 },
        ONSS_2026_09,
      ),
    ).toThrow(ErreurMoteur);
  });
});

describe('exigerBloc', () => {
  const base = { version: 1 as const, categorieEmployeur: 'PRIVE_MARCHAND' };

  it('renvoie le bloc présent', () => {
    expect(exigerBloc({ ...base, onss: ONSS_2026_09 }, 'onss')).toEqual(ONSS_2026_09);
  });

  it("s'arrête quand le bloc manque, avec un code stable", () => {
    try {
      exigerBloc(base, 'onss');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurMoteur);
      expect((e as ErreurMoteur).code).toBe('PARAMETRE_MANQUANT');
    }
  });
});
