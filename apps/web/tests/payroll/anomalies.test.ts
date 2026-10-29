// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { detecterAnomalies, type EntreeAnomalies } from '@/lib/payroll/anomalies';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import { ANOMALIES_2026 as BLOC } from './fixtures-bareme';

// Les seuils sont des choix de SocialFlow (D105) : les valeurs attendues se lisent directement
// sur l'entrée. Montants en centimes : 2 000,00 € s'écrit 200 000.

const entree = (surcharge: Partial<EntreeAnomalies>): EntreeAnomalies => ({
  brutCentimes: 300_000,
  netCentimes: 200_000,
  prestationsRealisees: 22,
  netMoisPrecedentCentimes: 200_000,
  ...surcharge,
});

const codes = (e: EntreeAnomalies) => detecterAnomalies(e, BLOC).map((a) => a.code);

describe('detecterAnomalies : fiche normale', () => {
  it('ne signale rien', () => {
    expect(detecterAnomalies(entree({}), BLOC)).toEqual([]);
  });
});

describe('detecterAnomalies : net', () => {
  it('net négatif : ERREUR', () => {
    expect(detecterAnomalies(entree({ netCentimes: -1_000 }), BLOC)).toEqual([
      {
        code: 'NET_NEGATIF',
        gravite: 'ERREUR',
        message: 'Le net est négatif : les retenues dépassent le brut.',
      },
      // Le net précédent est de 2 000,00 € : l'écart (2 010,00 €) dépasse aussi 25 %.
      expect.objectContaining({ code: 'ECART_NET_MOIS_PRECEDENT' }),
    ]);
  });

  it('net nul avec un brut : AVERTISSEMENT', () => {
    const r = detecterAnomalies(entree({ netCentimes: 0, netMoisPrecedentCentimes: null }), BLOC);
    expect(r).toEqual([expect.objectContaining({ code: 'NET_NUL', gravite: 'AVERTISSEMENT' })]);
  });

  it('net nul sans brut : rien (une fiche à zéro est cohérente)', () => {
    const r = codes(
      entree({
        brutCentimes: 0,
        netCentimes: 0,
        prestationsRealisees: 0,
        netMoisPrecedentCentimes: null,
      }),
    );
    expect(r).toEqual([]);
  });
});

describe('detecterAnomalies : brut et prestations', () => {
  it('brut nul avec des prestations', () => {
    expect(
      codes(entree({ brutCentimes: 0, netCentimes: 0, netMoisPrecedentCentimes: null })),
    ).toEqual(['BRUT_NUL_AVEC_PRESTATIONS']);
  });

  it('brut payé sans prestation', () => {
    expect(codes(entree({ prestationsRealisees: 0 }))).toEqual(['BRUT_SANS_PRESTATIONS']);
  });
});

describe('detecterAnomalies : écart avec le mois précédent (seuil 25 %)', () => {
  // Précédent 2 000,00 € = 200 000 ; 25 % = 50 000.
  it("écart de 25,00 % pile : pas d'alerte", () => {
    expect(codes(entree({ netCentimes: 250_000 }))).toEqual([]);
  });

  it('écart de 25,01 % : alerte', () => {
    // 2 000,00 + 500,02 = 2 500,02 -> écart 500,02 > 500,00
    expect(codes(entree({ netCentimes: 250_002 }))).toEqual(['ECART_NET_MOIS_PRECEDENT']);
  });

  it('une baisse compte comme une hausse', () => {
    // 2 000,00 - 500,02 = 1 499,98
    expect(codes(entree({ netCentimes: 149_998 }))).toEqual(['ECART_NET_MOIS_PRECEDENT']);
    expect(codes(entree({ netCentimes: 150_000 }))).toEqual([]);
  });

  it('pas de comparaison sans mois précédent', () => {
    expect(codes(entree({ netCentimes: 900_000, netMoisPrecedentCentimes: null }))).toEqual([]);
  });

  it('pas de comparaison si le mois précédent est nul', () => {
    expect(codes(entree({ netMoisPrecedentCentimes: 0 }))).toEqual([]);
  });

  it('le seuil vient du barème', () => {
    // seuil 10 % = 100 000 : 2 000,00 -> 2 200,01 alerte, 2 200,00 non
    const dixPourCent = { ...BLOC, ecartNetMoisPrecedent: 100_000 };
    expect(
      detecterAnomalies(entree({ netCentimes: 220_001 }), dixPourCent).map((a) => a.code),
    ).toEqual(['ECART_NET_MOIS_PRECEDENT']);
    expect(detecterAnomalies(entree({ netCentimes: 220_000 }), dixPourCent)).toEqual([]);
  });
});

describe('detecterAnomalies : proximité du plafond d’heures volontaires (seuil 90 %)', () => {
  // Plafond 360 h = 21 600 minutes ; 90 % = 19 440 minutes.
  const heures = (cumulMinutes: number) => ({ cumulMinutes, plafondMinutes: 21_600 });

  it('pas d’alerte à 90,00 % pile', () => {
    expect(codes(entree({ heuresVolontaires: heures(19_440) }))).toEqual([]);
  });

  it('alerte dès une minute au-dessus', () => {
    expect(codes(entree({ heuresVolontaires: heures(19_441) }))).toEqual([
      'HEURES_SUP_PLAFOND_PROCHE',
    ]);
  });

  it('pas d’alerte sans heures supplémentaires', () => {
    expect(codes(entree({ heuresVolontaires: null }))).toEqual([]);
  });

  it('refuse un plafond nul', () => {
    expect(() =>
      detecterAnomalies(
        entree({ heuresVolontaires: { cumulMinutes: 0, plafondMinutes: 0 } }),
        BLOC,
      ),
    ).toThrow(ErreurMoteur);
  });
});

describe('detecterAnomalies : plusieurs anomalies et entrées refusées', () => {
  it('cumule les anomalies', () => {
    // brut payé sans prestation + net nul + écart de 100 % avec le mois précédent
    expect(codes(entree({ netCentimes: 0, prestationsRealisees: 0 }))).toEqual([
      'NET_NUL',
      'BRUT_SANS_PRESTATIONS',
      'ECART_NET_MOIS_PRECEDENT',
    ]);
  });

  it('refuse les montants décimaux, un brut négatif et des prestations incohérentes', () => {
    for (const surcharge of [
      { brutCentimes: 100.5 },
      { brutCentimes: -1 },
      { netCentimes: 10.5 },
      { prestationsRealisees: -1 },
      { prestationsRealisees: 45_000 },
      { netMoisPrecedentCentimes: 1.5 },
      { netMoisPrecedentCentimes: undefined as never },
    ]) {
      expect(() => detecterAnomalies(entree(surcharge), BLOC)).toThrow(ErreurMoteur);
    }
  });
});
