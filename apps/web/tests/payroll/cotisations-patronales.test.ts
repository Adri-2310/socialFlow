// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  calculerCotisationsPatronales,
  type EntreeCotisationsPatronales,
} from '@/lib/payroll/cotisations-patronales';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import { COTISATIONS_PATRONALES_2026_3 as BLOC } from './fixtures-bareme';

// Valeurs attendues calculées à la main à partir des taux du document ONSS 2026/3 (calcul en
// commentaire). Montants en centimes : 556,64 € s'écrit 55 664.

const entree = (surcharge: Partial<EntreeCotisationsPatronales>): EntreeCotisationsPatronales => ({
  categorie: 'EMPLOYE',
  brutCentimes: 280_000,
  employeurDixTravailleursOuPlus: false,
  ...surcharge,
});

describe('calculerCotisationsPatronales', () => {
  it('employé à 2 800 €, employeur de moins de 10 travailleurs', () => {
    // base          = 2 800,00 x 19,88 %                       = 556,64
    // modération    = 2 800,00 x 4,27 % = 119,56
    //               + 556,64 x 4,27 % = 23,7685 -> 23,77       = 143,33
    // Fonds amiante = 2 800,00 x 0,01 %                        =   0,28
    // accidents     = 2 800,00 x 0,02 %                        =   0,56
    const r = calculerCotisationsPatronales(entree({}), BLOC);
    expect(r.base).toBe(280_000);
    expect(r.cotisationsReductibles).toBe(69_997); // 556,64 + 143,33
    expect(r.total).toBe(70_081);
    expect(r.lignes.map((l) => [l.code, l.montant])).toEqual([
      ['COTISATION_PATRONALE_BASE', 55_664],
      ['MODERATION_SALARIALE', 14_333],
      ['FONDS_AMIANTE', 28],
      ['ACCIDENTS_TRAVAIL_SPECIALE', 56],
    ]);
    expect(r.lignes[0]).toMatchObject({ base: 280_000, taux: 198_800 });
  });

  it('ajoute la cotisation de 1,60 % avec sa modération pour 10 travailleurs ou plus', () => {
    // 2 800,00 x 1,60 % = 44,80 ; modération 44,80 x 4,27 % = 1,9130 -> 1,91 ; ligne = 46,71.
    // Elle n'entre pas dans les cotisations réductibles (p. 376).
    const r = calculerCotisationsPatronales(entree({ employeurDixTravailleursOuPlus: true }), BLOC);
    expect(r.lignes.at(-1)).toMatchObject({ code: 'COTISATION_DIX_TRAVAILLEURS', montant: 4_671 });
    expect(r.total).toBe(74_752); // 700,81 + 46,71
    expect(r.cotisationsReductibles).toBe(69_997);
  });

  it('ouvrier à 2 000 € : base à 108 % et cotisations de vacances annuelles', () => {
    // base          = 2 000,00 x 108 %                          = 2 160,00
    // cotis. base   = 2 160,00 x 19,88 % = 429,408 -> 429,41
    // modération    = 2 160,00 x 4,27 % = 92,232 -> 92,23
    //               + 429,41 x 4,27 % = 18,3358 -> 18,34        = 110,57
    // vacances      = 2 160,00 x 5,57 % = 120,312 -> 120,31
    //               + 2 160,00 x 10,27 % = 221,832 -> 221,83
    // amiante       = 2 160,00 x 0,01 % = 0,216 -> 0,22
    // accidents     = 2 160,00 x 0,02 % = 0,432 -> 0,43
    const r = calculerCotisationsPatronales(
      entree({ categorie: 'OUVRIER', brutCentimes: 200_000 }),
      BLOC,
    );
    expect(r.base).toBe(216_000);
    expect(r.lignes.map((l) => [l.code, l.montant])).toEqual([
      ['COTISATION_PATRONALE_BASE', 42_941],
      ['MODERATION_SALARIALE', 11_057],
      ['VACANCES_ANNUELLES_TRIMESTRIELLE', 12_031],
      ['VACANCES_ANNUELLES_AVIS_DEBIT', 22_183],
      ['FONDS_AMIANTE', 22],
      ['ACCIDENTS_TRAVAIL_SPECIALE', 43],
    ]);
    expect(r.cotisationsReductibles).toBe(53_998);
    expect(r.total).toBe(88_277);
  });

  it('ne produit aucune ligne pour un brut nul', () => {
    const r = calculerCotisationsPatronales(entree({ brutCentimes: 0 }), BLOC);
    expect(r).toMatchObject({ base: 0, total: 0, cotisationsReductibles: 0, lignes: [] });
  });

  it('refuse les entrées incohérentes', () => {
    for (const surcharge of [
      { brutCentimes: 100.5 },
      { brutCentimes: -1 },
      { categorie: 'CADRE' as never },
      { employeurDixTravailleursOuPlus: undefined as never },
    ]) {
      expect(() => calculerCotisationsPatronales(entree(surcharge), BLOC)).toThrow(ErreurMoteur);
    }
  });
});
