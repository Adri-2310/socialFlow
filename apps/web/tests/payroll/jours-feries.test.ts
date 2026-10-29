// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import {
  calculerJoursFeriesOuvrier,
  type EntreeJoursFeriesOuvrier,
  type JourFerieOuvrier,
  joursFeriesDeLAnnee,
  joursFeriesDuMois,
  paques,
} from '@/lib/payroll/jours-feries';
import { JOURS_FERIES_2026 as BLOC } from './fixtures-bareme';

// Valeurs attendues calculées à la main (calcul en commentaire). Les dates de Pâques sont celles du
// calendrier officiel ; les autres jours se déduisent par les décalages de l'arrêté royal du
// 18 avril 1974 (lundi de Pâques + 1 jour, Ascension + 39, lundi de Pentecôte + 50).

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurMoteur);
    return (e as ErreurMoteur).code;
  }
  throw new Error('Aucune erreur levée');
};

describe('paques', () => {
  it.each([
    [2024, 3, 31], // année bissextile
    [2025, 4, 20],
    [2026, 4, 5],
    [2027, 3, 28],
    [2028, 4, 16],
    [2038, 4, 25], // la date la plus tardive possible
  ])('Pâques %i tombe le %i/%i (mois, jour) -> mois %i', (annee, mois, jour) => {
    expect(paques(annee)).toEqual({ mois, jour });
  });

  it('refuse une année hors du calendrier grégorien ou non entière', () => {
    expect(code(() => paques(1500))).toBe('ENTREE_INVALIDE');
    expect(code(() => paques(2026.5))).toBe('ENTREE_INVALIDE');
  });
});

describe('joursFeriesDeLAnnee', () => {
  it('2026 : les dix jours, dans l’ordre', () => {
    // Pâques 5 avril : lundi de Pâques 6 avril ; Ascension 5 avril + 39 = 14 mai ;
    // lundi de Pentecôte 5 avril + 50 = 25 mai.
    expect(joursFeriesDeLAnnee(2026, BLOC)).toEqual([
      '2026-01-01',
      '2026-04-06',
      '2026-05-01',
      '2026-05-14',
      '2026-05-25',
      '2026-07-21',
      '2026-08-15',
      '2026-11-01',
      '2026-11-11',
      '2026-12-25',
    ]);
  });

  it('2024 (bissextile) et 2027 : les jours mobiles', () => {
    // 2024 : Pâques 31 mars -> 1er avril, 9 mai, 20 mai.
    const f2024 = joursFeriesDeLAnnee(2024, BLOC);
    expect(f2024).toContain('2024-04-01');
    expect(f2024).toContain('2024-05-09');
    expect(f2024).toContain('2024-05-20');
    // 2027 : Pâques 28 mars -> 29 mars, 6 mai, 17 mai.
    const f2027 = joursFeriesDeLAnnee(2027, BLOC);
    expect(f2027).toContain('2027-03-29');
    expect(f2027).toContain('2027-05-06');
    expect(f2027).toContain('2027-05-17');
    expect(f2027).toHaveLength(10);
  });

  it('2025 : le lundi de Pentecôte tombe en juin', () => {
    // Pâques 20 avril : Ascension 20 avril + 39 = 29 mai ; lundi de Pentecôte + 50 = 9 juin.
    const f = joursFeriesDeLAnnee(2025, BLOC);
    expect(f).toContain('2025-05-29');
    expect(f).toContain('2025-06-09');
  });
});

describe('joursFeriesDuMois', () => {
  it('mai 2026 : trois jours ; mars 2026 : aucun', () => {
    expect(joursFeriesDuMois(2026, 5, BLOC)).toEqual(['2026-05-01', '2026-05-14', '2026-05-25']);
    expect(joursFeriesDuMois(2026, 3, BLOC)).toEqual([]);
  });

  it('refuse un mois impossible', () => {
    expect(code(() => joursFeriesDuMois(2026, 13, BLOC))).toBe('ENTREE_INVALIDE');
  });
});

const jour = (extra: Partial<JourFerieOuvrier> = {}): JourFerieOuvrier => ({
  date: '2026-05-14',
  nature: 'FERIE',
  minutesPerdues: 456, // 7 h 36
  absenceInjustifieeAutour: false,
  suspension: null,
  ...extra,
});

const entree = (jours: JourFerieOuvrier[], taux = 1_500): EntreeJoursFeriesOuvrier => ({
  tauxHoraireCentimes: taux,
  annee: 2026,
  jours,
});

describe('calculerJoursFeriesOuvrier : montant', () => {
  it('un jour férié : 15,00 €/h x 7 h 36 = 1 500 x 456 / 60 = 11 400 centimes', () => {
    const r = calculerJoursFeriesOuvrier(entree([jour()]), BLOC);
    expect(r.montant).toBe(11_400);
    expect(r.lignes).toEqual([
      {
        code: 'JOUR_FERIE',
        libelle: 'Jour férié 2026-05-14 : 7 h 36',
        base: 1_500,
        taux: null,
        montant: 11_400,
      },
    ]);
    expect(r.joursSansDroit).toEqual([]);
  });

  it('deux jours : 11 400 + (1 500 x 228 / 60 = 5 700) = 17 100 centimes', () => {
    const r = calculerJoursFeriesOuvrier(
      entree([jour(), jour({ date: '2026-05-25', minutesPerdues: 228 })]),
      BLOC,
    );
    expect(r.montant).toBe(17_100);
    expect(r.lignes).toHaveLength(2);
  });

  it('un jour de remplacement est payé comme un jour férié', () => {
    // Le 1er novembre 2026 est un dimanche : l'entreprise le remplace par le lundi 2 novembre.
    const r = calculerJoursFeriesOuvrier(
      entree([jour({ date: '2026-11-02', nature: 'REMPLACEMENT' })]),
      BLOC,
    );
    expect(r.montant).toBe(11_400);
    expect(r.lignes[0].libelle).toBe('Jour de remplacement 2026-11-02 : 7 h 36');
  });

  it('arrondit au cent, la moitié monte : 1 centime/h x 30 minutes = 0,5 -> 1', () => {
    expect(
      calculerJoursFeriesOuvrier(entree([jour({ minutesPerdues: 30 })], 1), BLOC).montant,
    ).toBe(1);
  });

  it('zéro heure perdue : rien à payer, pas de ligne', () => {
    const r = calculerJoursFeriesOuvrier(entree([jour({ minutesPerdues: 0 })]), BLOC);
    expect(r.montant).toBe(0);
    expect(r.lignes).toEqual([]);
  });
});

describe('calculerJoursFeriesOuvrier : droit à la rémunération', () => {
  it('perd le droit après une absence injustifiée autour du jour (art. 10)', () => {
    const r = calculerJoursFeriesOuvrier(entree([jour({ absenceInjustifieeAutour: true })]), BLOC);
    expect(r.montant).toBe(0);
    expect(r.joursSansDroit).toEqual([{ date: '2026-05-14', motif: 'ABSENCE_INJUSTIFIEE' }]);
  });

  it('maladie : droit conservé jusqu’au 30e jour, perdu au 31e (art. 12, 3°)', () => {
    const maladie = (joursDepuisDebut: number) =>
      calculerJoursFeriesOuvrier(
        entree([
          jour({ suspension: { type: 'MALADIE_ACCIDENT_MATERNITE_GREVE', joursDepuisDebut } }),
        ]),
        BLOC,
      );
    expect(maladie(30).montant).toBe(11_400);
    const r = maladie(31);
    expect(r.montant).toBe(0);
    expect(r.joursSansDroit).toEqual([{ date: '2026-05-14', motif: 'SUSPENSION_TROP_LONGUE' }]);
  });

  it('autre suspension : droit conservé jusqu’au 14e jour, perdu au 15e (art. 12, 4°)', () => {
    const autre = (joursDepuisDebut: number) =>
      calculerJoursFeriesOuvrier(
        entree([jour({ suspension: { type: 'AUTRE', joursDepuisDebut } })]),
        BLOC,
      );
    expect(autre(14).montant).toBe(11_400);
    expect(autre(15).montant).toBe(0);
  });

  it('vacances annuelles : droit toujours conservé (art. 12, 1°)', () => {
    const r = calculerJoursFeriesOuvrier(
      entree([jour({ suspension: { type: 'VACANCES', joursDepuisDebut: 20 } })]),
      BLOC,
    );
    expect(r.montant).toBe(11_400);
  });

  it('pendant une suspension, c’est l’art. 12 qui décide : l’absence autour du jour est justifiée', () => {
    const r = calculerJoursFeriesOuvrier(
      entree([
        jour({
          absenceInjustifieeAutour: true,
          suspension: { type: 'MALADIE_ACCIDENT_MATERNITE_GREVE', joursDepuisDebut: 10 },
        }),
      ]),
      BLOC,
    );
    expect(r.montant).toBe(11_400);
  });
});

describe('calculerJoursFeriesOuvrier : entrées refusées', () => {
  it('refuse un jour qui n’est pas férié, sauf comme remplacement', () => {
    expect(
      code(() => calculerJoursFeriesOuvrier(entree([jour({ date: '2026-05-15' })]), BLOC)),
    ).toBe('JOUR_FERIE_INCONNU');
  });

  it('refuse le même jour deux fois', () => {
    expect(code(() => calculerJoursFeriesOuvrier(entree([jour(), jour()]), BLOC))).toBe(
      'JOUR_FERIE_EN_DOUBLE',
    );
  });

  it('refuse les taux, minutes et durées incohérents', () => {
    for (const e of [
      entree([jour()], 0),
      entree([jour()], 15.5),
      entree([jour({ minutesPerdues: -1 })]),
      entree([jour({ minutesPerdues: 1.5 })]),
      entree([jour({ minutesPerdues: 1_441 })]),
      entree([jour({ suspension: { type: 'AUTRE', joursDepuisDebut: 0 } })]),
    ]) {
      expect(code(() => calculerJoursFeriesOuvrier(e, BLOC))).toBe('ENTREE_INVALIDE');
    }
  });
});
