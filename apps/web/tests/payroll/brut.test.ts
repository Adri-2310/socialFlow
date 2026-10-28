// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  calculerBrutEmploye,
  calculerBrutOuvrier,
  type EntreeBrutEmploye,
  type EntreeBrutOuvrier,
} from '@/lib/payroll/brut';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import { BORNES } from '@/lib/payroll/validation';

// Valeurs attendues calculées à la main, détaillées en commentaire. Ce sont des tests d'arithmétique
// de l'étape 3, pas des cas de référence (ceux-ci viennent d'une source externe, étape 9).

const employe = (extra: Partial<EntreeBrutEmploye> = {}): EntreeBrutEmploye => ({
  remunerationMensuelle: 240_000,
  absenceNonRemDemiJours: 0,
  joursReferenceMois: null,
  primeCents: null,
  primeLibelle: null,
  ...extra,
});

const ouvrier = (extra: Partial<EntreeBrutOuvrier> = {}): EntreeBrutOuvrier => ({
  tauxHoraire: 1_500,
  heuresPresteesMinutes: 1_824,
  primeCents: null,
  primeLibelle: null,
  ...extra,
});

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurMoteur);
    return (e as ErreurMoteur).code;
  }
  throw new Error('Aucune erreur levée');
};

describe('calculerBrutEmploye', () => {
  it('sans absence, le brut est la rémunération saisie, sans aucune fraction (D100)', () => {
    // Un 4/5 dont le contrat dit 2 400,00 € : le moteur ne le réduit pas une seconde fois.
    const r = calculerBrutEmploye(employe());
    expect(r.brut).toBe(240_000);
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0]).toMatchObject({ code: 'SALAIRE_BASE', montant: 240_000 });
  });

  it("déduit une journée d'absence : 2 400,00 x 2 / (2 x 20) = 120,00 €", () => {
    const r = calculerBrutEmploye(employe({ absenceNonRemDemiJours: 2, joursReferenceMois: 20 }));
    expect(r.brut).toBe(228_000);
    expect(r.lignes[1]).toMatchObject({
      code: 'ABSENCE_NON_REMUNEREE',
      base: 240_000,
      montant: -12_000,
    });
    expect(r.lignes[1].libelle).toBe('Absence non rémunérée : 1 jour sur 20');
  });

  it('arrondit une demi-journée : 240 000 x 1 / 44 = 5 454,54 -> 5 455 centimes', () => {
    const r = calculerBrutEmploye(employe({ absenceNonRemDemiJours: 1, joursReferenceMois: 22 }));
    expect(r.lignes[1].montant).toBe(-5_455);
    expect(r.brut).toBe(234_545);
  });

  it("arrondit l'absence, la moitié vers le haut : 100 001 x 1 / 2 = 50 000,5 -> 50 001", () => {
    const r = calculerBrutEmploye(
      employe({ remunerationMensuelle: 100_001, absenceNonRemDemiJours: 1, joursReferenceMois: 1 }),
    );
    expect(r.lignes[1].montant).toBe(-50_001);
    expect(r.brut).toBe(50_000);
  });

  it('ajoute une prime avec son libellé', () => {
    const r = calculerBrutEmploye(
      employe({ primeCents: 5_000, primeLibelle: " Prime de fin d'année " }),
    );
    expect(r.brut).toBe(245_000);
    expect(r.lignes[1]).toMatchObject({
      code: 'PRIME',
      libelle: "Prime de fin d'année",
      montant: 5_000,
    });
  });

  it('donne un libellé par défaut à une prime sans libellé, et ignore une prime nulle', () => {
    expect(calculerBrutEmploye(employe({ primeCents: 100 })).lignes[1].libelle).toBe('Prime');
    expect(calculerBrutEmploye(employe({ primeCents: 0 })).lignes).toHaveLength(1);
  });

  it('combine absence et prime : 2 400 - 120 + 50 = 2 330,00 €', () => {
    const r = calculerBrutEmploye(
      employe({
        absenceNonRemDemiJours: 2,
        joursReferenceMois: 20,
        primeCents: 5_000,
      }),
    );
    expect(r.brut).toBe(233_000);
  });

  it('refuse de valoriser une absence sans jours de référence', () => {
    expect(code(() => calculerBrutEmploye(employe({ absenceNonRemDemiJours: 2 })))).toBe(
      'JOURS_REFERENCE_MANQUANT',
    );
  });

  it('refuse une absence supérieure au mois de référence', () => {
    expect(
      code(() =>
        calculerBrutEmploye(employe({ absenceNonRemDemiJours: 41, joursReferenceMois: 20 })),
      ),
    ).toBe('ABSENCE_SUPERIEURE_AU_MOIS');
  });

  it('refuse une rémunération ou une prime au-delà de ce que le calcul sait représenter', () => {
    expect(
      code(() => calculerBrutEmploye(employe({ remunerationMensuelle: BORNES.montantMax + 1 }))),
    ).toBe('ENTREE_INVALIDE');
    expect(code(() => calculerBrutEmploye(employe({ primeCents: BORNES.montantMax + 1 })))).toBe(
      'ENTREE_INVALIDE',
    );
    expect(calculerBrutEmploye(employe({ remunerationMensuelle: BORNES.montantMax })).brut).toBe(
      BORNES.montantMax,
    );
  });

  it('refuse les entrées incohérentes', () => {
    expect(code(() => calculerBrutEmploye(employe({ remunerationMensuelle: 0 })))).toBe(
      'ENTREE_INVALIDE',
    );
    expect(code(() => calculerBrutEmploye(employe({ remunerationMensuelle: 3000.5 })))).toBe(
      'ENTREE_INVALIDE',
    );
    expect(code(() => calculerBrutEmploye(employe({ absenceNonRemDemiJours: -1 })))).toBe(
      'ENTREE_INVALIDE',
    );
    expect(code(() => calculerBrutEmploye(employe({ primeCents: -1 })))).toBe('ENTREE_INVALIDE');
    expect(
      code(() =>
        calculerBrutEmploye(employe({ absenceNonRemDemiJours: 2, joursReferenceMois: 0 })),
      ),
    ).toBe('ENTREE_INVALIDE');
  });
});

describe('calculerBrutOuvrier', () => {
  it('heures x taux : 15,00 €/h x 30 h 24 = 456,00 €', () => {
    const r = calculerBrutOuvrier(ouvrier());
    expect(r.brut).toBe(45_600);
    expect(r.lignes[0]).toMatchObject({ code: 'HEURES_PRESTEES', base: 1_500, montant: 45_600 });
    expect(r.lignes[0].libelle).toBe('Heures prestées : 30 h 24');
  });

  it('arrondit au cent : 0,30 €/h x 1 minute = 0,5 centime -> 1 centime', () => {
    expect(calculerBrutOuvrier(ouvrier({ tauxHoraire: 30, heuresPresteesMinutes: 1 })).brut).toBe(
      1,
    );
    // 0,29 €/h x 1 minute = 0,483 centime -> 0
    expect(calculerBrutOuvrier(ouvrier({ tauxHoraire: 29, heuresPresteesMinutes: 1 })).brut).toBe(
      0,
    );
  });

  it('ajoute une prime', () => {
    const r = calculerBrutOuvrier(ouvrier({ primeCents: 2_000, primeLibelle: 'Prime' }));
    expect(r.brut).toBe(47_600);
    expect(r.lignes[1].code).toBe('PRIME');
  });

  it('accepte zéro heure prestée', () => {
    expect(calculerBrutOuvrier(ouvrier({ heuresPresteesMinutes: 0 })).brut).toBe(0);
  });

  it('refuse un ouvrier sans heures prestées : jamais déduites du régime', () => {
    expect(code(() => calculerBrutOuvrier(ouvrier({ heuresPresteesMinutes: null })))).toBe(
      'HEURES_PRESTEES_MANQUANTES',
    );
  });

  it("refuse des heures au-delà d'un mois, un taux nul ou flottant", () => {
    expect(code(() => calculerBrutOuvrier(ouvrier({ heuresPresteesMinutes: 44_641 })))).toBe(
      'ENTREE_INVALIDE',
    );
    expect(code(() => calculerBrutOuvrier(ouvrier({ tauxHoraire: 0 })))).toBe('ENTREE_INVALIDE');
    expect(code(() => calculerBrutOuvrier(ouvrier({ tauxHoraire: 15.5 })))).toBe('ENTREE_INVALIDE');
  });
});
