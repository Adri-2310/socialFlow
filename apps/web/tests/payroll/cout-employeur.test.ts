// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calculerCotisationsPatronales } from '@/lib/payroll/cotisations-patronales';
import { calculerCoutEmployeur } from '@/lib/payroll/cout-employeur';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import { calculerReductionStructurelle } from '@/lib/payroll/reduction-structurelle';
import { COTISATIONS_PATRONALES_2026_3, REDUCTION_STRUCTURELLE_2026_3 } from './fixtures-bareme';

// Coût employeur = brut + cotisations patronales - réduction structurelle. Valeurs à la main.

describe('calculerCoutEmployeur', () => {
  it('employé à 2 800 € : 3 276,02 €', () => {
    // 2 800,00 + 700,81 - 224,79 = 3 276,02
    expect(
      calculerCoutEmployeur({
        brutCentimes: 280_000,
        cotisationsPatronalesCentimes: 70_081,
        reductionStructurelleCentimes: 22_479,
      }),
    ).toBe(327_602);
  });

  it('enchaîne les deux étapes sur le même employé', () => {
    const cotisations = calculerCotisationsPatronales(
      { categorie: 'EMPLOYE', brutCentimes: 280_000, employeurDixTravailleursOuPlus: false },
      COTISATIONS_PATRONALES_2026_3,
    );
    const reduction = calculerReductionStructurelle(
      {
        brutReferenceCentimes: 280_000,
        prestations: { unite: 'JOURS', realisees: 22, pleinTemps: 22 },
        contratAuMoinsMiTemps: true,
        cotisationsReductiblesCentimes: cotisations.cotisationsReductibles,
      },
      REDUCTION_STRUCTURELLE_2026_3,
    );
    expect(
      calculerCoutEmployeur({
        brutCentimes: 280_000,
        cotisationsPatronalesCentimes: cotisations.total,
        reductionStructurelleCentimes: reduction.reduction,
      }),
    ).toBe(327_602);
  });

  it('sans réduction, le coût est brut + cotisations', () => {
    // 4 000,00 + 795,20 = 4 795,20
    expect(
      calculerCoutEmployeur({
        brutCentimes: 400_000,
        cotisationsPatronalesCentimes: 79_520,
        reductionStructurelleCentimes: 0,
      }),
    ).toBe(479_520);
  });

  it('refuse un montant décimal ou une réduction supérieure aux cotisations', () => {
    const base = {
      brutCentimes: 280_000,
      cotisationsPatronalesCentimes: 70_081,
      reductionStructurelleCentimes: 22_479,
    };
    expect(() => calculerCoutEmployeur({ ...base, brutCentimes: 100.5 })).toThrow(ErreurMoteur);
    expect(() => calculerCoutEmployeur({ ...base, reductionStructurelleCentimes: 70_082 })).toThrow(
      ErreurMoteur,
    );
  });
});
