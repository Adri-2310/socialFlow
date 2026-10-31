// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  bonusEmploiSchema,
  onssSchema,
  versionBaremeCompleteSchema,
  voletBonusSchema,
} from '@/lib/payroll/bareme/schema';
import { BONUS_EMPLOI_2026_09, ONSS_2026_09 } from './fixtures-bareme';

// Les blocs `onss` et `bonusEmploi` (étape 4) : forme stricte, entiers, source obligatoire.
const source = {
  document: 'Instructions administratives ONSS',
  reference: 'p. 175-176, 448-453',
  versionDocument: '2026/3',
  consulteLe: '2026-10-28',
};
const versionAvecBlocs = {
  code: 'BE-2026-09',
  valideDepuis: '2026-09-01',
  valideJusqua: null,
  statut: 'A_VERIFIER' as const,
  categorieEmployeur: 'PRIVE_MARCHAND',
  parametres: {
    version: 1 as const,
    categorieEmployeur: 'PRIVE_MARCHAND',
    onss: ONSS_2026_09,
    bonusEmploi: BONUS_EMPLOI_2026_09,
  },
  source: { onss: source, bonusEmploi: source },
};

describe('bloc onss', () => {
  it('accepte les valeurs de septembre 2026', () => {
    expect(onssSchema.parse(ONSS_2026_09)).toEqual(ONSS_2026_09);
  });

  it('refuse un taux décimal, un taux hors plafond et une clé inconnue', () => {
    expect(onssSchema.safeParse({ ...ONSS_2026_09, tauxPersonnel: 13.07 }).success).toBe(false);
    expect(onssSchema.safeParse({ ...ONSS_2026_09, tauxPersonnel: 10_000_001 }).success).toBe(
      false,
    );
    expect(onssSchema.safeParse({ ...ONSS_2026_09, tauxPatronal: 1 }).success).toBe(false);
  });
});

describe('bloc bonusEmploi', () => {
  it('accepte les tableaux de septembre 2026', () => {
    expect(bonusEmploiSchema.parse(BONUS_EMPLOI_2026_09)).toEqual(BONUS_EMPLOI_2026_09);
  });

  it('refuse un montant décimal ou négatif', () => {
    const volet = BONUS_EMPLOI_2026_09.employe.voletA;
    expect(voletBonusSchema.safeParse({ ...volet, montantMax: 127.54 }).success).toBe(false);
    expect(voletBonusSchema.safeParse({ ...volet, montantMax: -1 }).success).toBe(false);
  });

  it('refuse un plafond nul placé avant le plafond plein', () => {
    const volet = BONUS_EMPLOI_2026_09.employe.voletA;
    expect(
      voletBonusSchema.safeParse({ ...volet, plafondNul: volet.plafondPlein - 1 }).success,
    ).toBe(false);
  });

  it('refuse un tableau incomplet (volet manquant)', () => {
    const { voletB: _voletB, ...sansB } = BONUS_EMPLOI_2026_09.employe;
    expect(bonusEmploiSchema.safeParse({ ...BONUS_EMPLOI_2026_09, employe: sansB }).success).toBe(
      false,
    );
  });
});

describe('version complète avec blocs', () => {
  it('accepte une version dont chaque bloc a sa source', () => {
    expect(versionBaremeCompleteSchema.safeParse(versionAvecBlocs).success).toBe(true);
  });

  it('refuse un bloc sans source', () => {
    const { bonusEmploi: _s, ...sourceSansBonus } = versionAvecBlocs.source;
    expect(
      versionBaremeCompleteSchema.safeParse({ ...versionAvecBlocs, source: sourceSansBonus })
        .success,
    ).toBe(false);
  });

  it("accepte toujours un barème sans aucun bloc (forme de l'étape 2)", () => {
    const nu = {
      ...versionAvecBlocs,
      parametres: { version: 1 as const, categorieEmployeur: 'PRIVE_MARCHAND' },
      source: {},
    };
    expect(versionBaremeCompleteSchema.safeParse(nu).success).toBe(true);
  });
});
