// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ErreurMoteur } from '@/lib/payroll/erreurs';
import {
  calculerSalaireGarantiEmploye,
  calculerSalaireGarantiOuvrier,
  type EntreeSalaireGarantiEmploye,
  type EntreeSalaireGarantiOuvrier,
  type JourIncapaciteEmploye,
  type JourIncapaciteOuvrier,
  plafondEffectifJournalier,
} from '@/lib/payroll/salaire-garanti';
import { arrondirFraction } from '@/lib/payroll/arrondi';
import { SALAIRE_GARANTI_2026 as BLOC } from './fixtures-bareme';

// Valeurs attendues calculées à la main (calcul en commentaire). Le plafond journalier de la
// fixture (100,00 €) est une valeur de TEST : ces tests vérifient l'arithmétique, pas le plafond réel.
// Début de l'incapacité : lundi 2 mars 2026 = jour 1 ; dimanche 8 mars = jour 7 ; lundi 9 mars = jour 8 ;
// dimanche 15 mars = jour 14 ; lundi 16 mars = jour 15 ; mardi 31 mars = jour 30 ; mercredi 1er avril = jour 31.

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurMoteur);
    return (e as ErreurMoteur).code;
  }
  throw new Error('Aucune erreur levée');
};

// ---------------------------------------------------------------- ouvrier
// 15,00 €/h x 7 h 36 (456 minutes) = 1 500 x 456 / 60 = 11 400 centimes = 114,00 € par jour.
const jo = (date: string, minutesPrevues = 456, dejaRemunere = false): JourIncapaciteOuvrier => ({
  date,
  minutesPrevues,
  dejaRemunere,
});
const entreeOuvrier = (
  jours: JourIncapaciteOuvrier[],
  extra: Partial<EntreeSalaireGarantiOuvrier> = {},
): EntreeSalaireGarantiOuvrier => ({
  tauxHoraireCentimes: 1_500,
  joursActiviteParSemaine: 6, // plafond de l'INAMI tel quel (6 jours par semaine)
  nature: 'MALADIE',
  debutPeriodeGarantie: '2026-03-02',
  dateUnMoisAnciennete: null,
  exclusion: null,
  jours,
  ...extra,
});
const semaine1 = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06'].map((d) =>
  jo(d),
);
const semaine2 = ['2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13'].map((d) =>
  jo(d),
);
const semaine3 = ['2026-03-16', '2026-03-17', '2026-03-18', '2026-03-19', '2026-03-20'].map((d) =>
  jo(d),
);

describe('calculerSalaireGarantiOuvrier : maladie (art. 52)', () => {
  it('première semaine à 100 % : 5 x 114,00 = 570,00 €', () => {
    const r = calculerSalaireGarantiOuvrier(entreeOuvrier(semaine1), BLOC);
    expect(r.montant).toBe(57_000);
    expect(r.lignes).toEqual([
      {
        code: 'SALAIRE_GARANTI_100',
        libelle: 'Salaire garanti à 100 % : 38 h 00',
        base: 1_500,
        taux: null,
        montant: 57_000,
      },
    ]);
  });

  it('deuxième semaine : loi à 60 % plafonné (300,00 €) + complément CCT 12bis (189,52 €)', () => {
    // loi : 5 x min(114,00 ; 100,00) = 500,00 -> 60 % = 300,00 € (30 000)
    // CCT : 25,88 % x 500,00 = 129,40 € (12 940) ; 85,88 % x 5 x 14,00 = 70,00 -> 60,116 -> 60,12 € (6 012)
    // total 489,52 € = 85,88 % de 570,00 € (489,516)
    const r = calculerSalaireGarantiOuvrier(entreeOuvrier(semaine2), BLOC);
    expect(r.montant).toBe(48_952);
    expect(r.complement).toBe(18_952);
    expect(r.lignes).toEqual([
      {
        code: 'SALAIRE_GARANTI_60',
        libelle: 'Salaire garanti à 60 % (plafonné) : 38 h 00',
        base: 50_000,
        taux: 600_000,
        montant: 30_000,
      },
      {
        code: 'COMPLEMENT_CCT_PLAFONNE',
        libelle: 'Indemnité complémentaire CCT 12bis (part sous le plafond)',
        base: 50_000,
        taux: 258_800,
        montant: 12_940,
      },
      {
        code: 'COMPLEMENT_CCT_EXCEDENT',
        libelle: 'Indemnité complémentaire CCT 12bis (part au-dessus du plafond)',
        base: 7_000,
        taux: 858_800,
        montant: 6_012,
      },
    ]);
  });

  it('seuls les jours à 100 % entrent dans la base ONSS (ONSS 2026/3, p. 115)', () => {
    expect(calculerSalaireGarantiOuvrier(entreeOuvrier(semaine1), BLOC).baseOnss).toBe(57_000);
    expect(calculerSalaireGarantiOuvrier(entreeOuvrier(semaine2), BLOC).baseOnss).toBe(0);
    // un mois sur trois semaines : 570,00 € à 100 % soumis à l'ONSS, le reste (loi 60 % et complément) exclu
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier([...semaine1, ...semaine2, ...semaine3]),
      BLOC,
    );
    expect(r.montant).toBe(124_903);
    expect(r.baseOnss).toBe(57_000);
  });

  it('sous le plafond : 10,00 €/h -> 76,00 € par jour, 5 jours = 380,00 € : 60 % + 25,88 % = 326,34 €', () => {
    // 1 000 x 456 / 60 = 7 600 par jour ; 5 jours = 38 000 ; loi 60 % = 22 800
    // CCT : 25,88 % x 38 000 = 9 834,4 -> 9 834 ; total 32 634 = 85,88 % de 380,00 € (326,344)
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier(semaine2, { tauxHoraireCentimes: 1_000 }),
      BLOC,
    );
    expect(r.montant).toBe(32_634);
    expect(r.lignes.map((l) => l.code)).toEqual(['SALAIRE_GARANTI_60', 'COMPLEMENT_CCT_PLAFONNE']);
  });

  it('un mois sur trois semaines : 570,00 + 300,00 + 379,03 = 1 249,03 €', () => {
    // sommes des 10 jours à complément : sous le plafond 100 000 -> 25,88 % = 25 880 ;
    // au-dessus 14 000 -> 85,88 % = 12 023,2 -> 12 023 ; complément 37 903
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier([...semaine1, ...semaine2, ...semaine3]),
      BLOC,
    );
    expect(r.montant).toBe(124_903);
    expect(r.complement).toBe(37_903);
    expect(r.lignes.map((l) => l.code)).toEqual([
      'SALAIRE_GARANTI_100',
      'SALAIRE_GARANTI_60',
      'COMPLEMENT_CCT_PLAFONNE',
      'COMPLEMENT_CCT_EXCEDENT',
    ]);
  });

  it('les limites : jours 1 à 7 à 100 %, 8 à 14 loi + CCT, 15 à 30 CCT seule, 31 plus rien', () => {
    const un = (date: string) =>
      calculerSalaireGarantiOuvrier(entreeOuvrier([jo(date)]), BLOC).montant;
    // un jour : loi 60 % x 100,00 = 60,00 ; CCT 25,88 % x 100,00 + 85,88 % x 14,00 = 25,88 + 12,02 = 37,90
    expect(un('2026-03-08')).toBe(11_400); // jour 7 : 114,00 €
    expect(un('2026-03-09')).toBe(9_790); // jour 8 : 60,00 + 37,90 = 97,90 €
    expect(un('2026-03-15')).toBe(9_790); // jour 14
    expect(un('2026-03-16')).toBe(3_790); // jour 15 : CCT seule, 37,90 €
    expect(un('2026-03-31')).toBe(3_790); // jour 30
    expect(un('2026-04-01')).toBe(0); // jour 31 : plus d'employeur
  });

  it('un jour sans activité (0 minute) ne rapporte rien mais compte dans la période (art. 56)', () => {
    // samedi 7 et dimanche 8 sans activité : le lundi 9 reste le jour 8 (60,00 + 37,90 = 97,90 €)
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier([jo('2026-03-07', 0), jo('2026-03-08', 0), jo('2026-03-09')]),
      BLOC,
    );
    expect(r.montant).toBe(9_790);
  });

  it('un jour déjà rémunéré (jour férié) compte dans la période mais n’est pas payé deux fois', () => {
    // mercredi 4 mars déjà payé ailleurs : 4 jours x 114,00 = 456,00 €
    const jours = semaine1.map((j) => (j.date === '2026-03-04' ? jo(j.date, 456, true) : j));
    expect(calculerSalaireGarantiOuvrier(entreeOuvrier(jours), BLOC).montant).toBe(45_600);
  });

  it('un avantage complémentaire déjà payé s’impute sur le complément (CCT 12bis, art. 9)', () => {
    // complément 189,52 € - avantage 100,00 € = 89,52 € ; loi 300,00 € ; total 389,52 €
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier(semaine2, { avantageComplementaireImputableCentimes: 10_000 }),
      BLOC,
    );
    expect(r.complement).toBe(8_952);
    expect(r.montant).toBe(38_952);
    expect(r.lignes.at(-1)).toEqual({
      code: 'COMPLEMENT_CCT_IMPUTATION',
      libelle: 'Avantage complémentaire déjà payé (imputé)',
      base: null,
      taux: null,
      montant: -10_000,
    });
  });

  it('l’imputation ne dépasse jamais le complément : avantage de 500,00 € -> complément 0', () => {
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier(semaine2, { avantageComplementaireImputableCentimes: 50_000 }),
      BLOC,
    );
    expect(r.complement).toBe(0);
    expect(r.montant).toBe(30_000);
    expect(r.lignes.at(-1)?.montant).toBe(-18_952);
  });

  it('refuse un avantage imputable négatif ou décimal', () => {
    for (const v of [-1, 1.5]) {
      expect(
        code(() =>
          calculerSalaireGarantiOuvrier(
            entreeOuvrier(semaine2, { avantageComplementaireImputableCentimes: v }),
            BLOC,
          ),
        ),
      ).toBe('ENTREE_INVALIDE');
    }
  });
});

describe('calculerSalaireGarantiOuvrier : accident du travail (art. 54)', () => {
  it('7 jours à 100 %, pas de période à 60 %', () => {
    const at = (jours: JourIncapaciteOuvrier[]) =>
      calculerSalaireGarantiOuvrier(entreeOuvrier(jours, { nature: 'ACCIDENT_TRAVAIL' }), BLOC);
    expect(at(semaine1).montant).toBe(57_000);
    expect(at(semaine2).montant).toBe(0); // jour 8 : plus d'employeur
  });

  it('aucune condition d’ancienneté pour un accident du travail', () => {
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier(semaine1, { nature: 'ACCIDENT_TRAVAIL', dateUnMoisAnciennete: '2026-03-05' }),
      BLOC,
    );
    expect(r.montant).toBe(57_000);
  });
});

describe('calculerSalaireGarantiOuvrier : ancienneté et exclusions', () => {
  it('un mois d’ancienneté atteint le 5 mars : seuls les 5 et 6 mars sont payés (2 x 114,00 €)', () => {
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier(semaine1, { dateUnMoisAnciennete: '2026-03-05' }),
      BLOC,
    );
    expect(r.montant).toBe(22_800);
  });

  it('une exclusion (art. 52 § 3) supprime tout droit', () => {
    for (const exclusion of ['FAUTE_GRAVE', 'COMPETITION_SPORTIVE_REMUNEREE'] as const) {
      const r = calculerSalaireGarantiOuvrier(entreeOuvrier(semaine1, { exclusion }), BLOC);
      expect(r).toEqual({ montant: 0, baseOnss: 0, complement: 0, lignes: [] });
    }
  });

  it('refuse une exclusion de la vie privée sur un accident du travail', () => {
    expect(
      code(() =>
        calculerSalaireGarantiOuvrier(
          entreeOuvrier(semaine1, { nature: 'ACCIDENT_TRAVAIL', exclusion: 'FAUTE_GRAVE' }),
          BLOC,
        ),
      ),
    ).toBe('EXCLUSION_INCOMPATIBLE');
  });
});

describe('calculerSalaireGarantiOuvrier : entrées refusées', () => {
  it('refuse un jour avant le début, un doublon, une date impossible', () => {
    expect(code(() => calculerSalaireGarantiOuvrier(entreeOuvrier([jo('2026-03-01')]), BLOC))).toBe(
      'JOUR_AVANT_DEBUT_PERIODE',
    );
    expect(
      code(() =>
        calculerSalaireGarantiOuvrier(entreeOuvrier([jo('2026-03-03'), jo('2026-03-03')]), BLOC),
      ),
    ).toBe('JOUR_EN_DOUBLE');
    expect(code(() => calculerSalaireGarantiOuvrier(entreeOuvrier([jo('2026-02-30')]), BLOC))).toBe(
      'ENTREE_INVALIDE',
    );
  });

  it('refuse les taux et minutes incohérents', () => {
    for (const e of [
      entreeOuvrier([jo('2026-03-02')], { tauxHoraireCentimes: 0 }),
      entreeOuvrier([jo('2026-03-02')], { tauxHoraireCentimes: 15.5 }),
      entreeOuvrier([jo('2026-03-02', -1)]),
      entreeOuvrier([jo('2026-03-02', 1.5)]),
      entreeOuvrier([jo('2026-03-02', 1_441)]),
    ]) {
      expect(code(() => calculerSalaireGarantiOuvrier(e, BLOC))).toBe('ENTREE_INVALIDE');
    }
  });
});

// ---------------------------------------------------------------- employé
// Salaire de 2 400,00 € sur 20 jours de référence : un jour vaut 120,00 €, une demi-journée 60,00 €.
const je = (date: string, demiJoursPrevus = 2): JourIncapaciteEmploye => ({
  date,
  demiJoursPrevus,
});
const entreeEmploye = (
  jours: JourIncapaciteEmploye[],
  extra: Partial<EntreeSalaireGarantiEmploye> = {},
): EntreeSalaireGarantiEmploye => ({
  remunerationMensuelle: 240_000,
  joursReferenceMois: 20,
  joursActiviteParSemaine: 6, // plafond de l'INAMI tel quel (6 jours par semaine)
  contrat: 'LONGUE_DUREE',
  nature: 'MALADIE',
  debutPeriodeGarantie: '2026-03-02',
  jours,
  ...extra,
});

describe('calculerSalaireGarantiEmploye : contrat de 3 mois ou plus (art. 70)', () => {
  it('jusqu’au 30e jour, rien à retrancher', () => {
    const r = calculerSalaireGarantiEmploye(entreeEmploye([je('2026-03-31')]), BLOC); // jour 30
    expect(r).toEqual({
      retenue: 0,
      horsOnss: 0,
      complement: 0,
      demiJoursNonGarantis: 0,
      demiJoursAPartiel: 0,
      demiJoursAvecComplement: 0,
      lignes: [],
    });
  });

  it('dès le 31e jour : 1 jour = 2 400,00 x 2 / (2 x 20) = 120,00 € retranchés', () => {
    const r = calculerSalaireGarantiEmploye(entreeEmploye([je('2026-04-01')]), BLOC); // jour 31
    expect(r.retenue).toBe(12_000);
    expect(r.demiJoursNonGarantis).toBe(2);
    expect(r.lignes).toEqual([
      {
        code: 'SALAIRE_GARANTI_FIN',
        libelle: 'Incapacité au-delà du salaire garanti : 1 jour sur 20',
        base: 240_000,
        taux: null,
        montant: -12_000,
      },
    ]);
  });

  it('4 jours après le 30e jour : 2 400,00 x 8 / 40 = 480,00 € ; un jour férié sans activité ne compte pas', () => {
    const r = calculerSalaireGarantiEmploye(
      entreeEmploye([
        je('2026-04-01'),
        je('2026-04-02'),
        je('2026-04-03'),
        je('2026-04-06', 0), // lundi de Pâques : pas un jour d'activité
        je('2026-04-07'),
      ]),
      BLOC,
    );
    expect(r.retenue).toBe(48_000);
    expect(r.demiJoursNonGarantis).toBe(8);
  });

  it('une demi-journée : 2 400,00 x 1 / 40 = 60,00 €', () => {
    const r = calculerSalaireGarantiEmploye(entreeEmploye([je('2026-04-01', 1)]), BLOC);
    expect(r.retenue).toBe(6_000);
  });

  it('un accident du travail suit la même durée de 30 jours', () => {
    const r = calculerSalaireGarantiEmploye(
      entreeEmploye([je('2026-04-01')], { nature: 'ACCIDENT_TRAVAIL' }),
      BLOC,
    );
    expect(r.retenue).toBe(12_000);
  });
});

describe('calculerSalaireGarantiEmploye : contrat de moins de 3 mois (art. 71 et 72, CCT 13bis)', () => {
  const court = (
    jours: JourIncapaciteEmploye[],
    extra: Partial<EntreeSalaireGarantiEmploye> = {},
  ) =>
    calculerSalaireGarantiEmploye(
      entreeEmploye(jours, { contrat: 'COURTE_DUREE', ...extra }),
      BLOC,
    );
  const jours8a11 = [je('2026-03-09'), je('2026-03-10'), je('2026-03-11'), je('2026-03-12')];

  it('jours 1 à 7 : rien à retrancher', () => {
    expect(court([je('2026-03-06'), je('2026-03-08')]).retenue).toBe(0);
  });

  it('jours 8 à 11 (8 demi-jours) : loi 60 % + complément CCT 13bis, retenue de 62,74 €', () => {
    // valeur 2 400,00 x 8 / 40 = 480,00 € (48 000) ; plafond 100,00 x 8 / 2 = 400,00 € (40 000)
    // loi : 60 % x 400,00 = 240,00 € (24 000)
    // CCT : 26,93 % x 400,00 = 107,72 € (10 772) ; 86,93 % x 80,00 = 69,544 -> 69,54 € (6 954)
    // payé 24 000 + 17 726 = 41 726 (= 86,93 % de 480,00 : 417,264) ; retenue 48 000 - 41 726 = 6 274
    const r = court(jours8a11);
    expect(r.retenue).toBe(6_274);
    expect(r.horsOnss).toBe(41_726);
    expect(r.complement).toBe(17_726);
    expect(r.demiJoursAPartiel).toBe(8);
    expect(r.demiJoursAvecComplement).toBe(8);
    expect(r.lignes).toEqual([
      {
        code: 'SALAIRE_GARANTI_PARTIEL_RETENUE',
        libelle:
          'Incapacité du 8e au 30e jour, salaire à 60 % et complément CCT 13bis : 4 jours sur 20',
        base: 48_000,
        taux: null,
        montant: -6_274,
      },
    ]);
  });

  it('le salaire versé en indemnité est exclu de la base ONSS : 417,26 € ; contrat long : rien', () => {
    expect(court(jours8a11).horsOnss).toBe(41_726);
    expect(calculerSalaireGarantiEmploye(entreeEmploye([je('2026-04-01')]), BLOC).horsOnss).toBe(0);
  });

  it('sous le plafond : 1 000,00 € -> 8 demi-jours = 200,00 € ; 60 % (120,00) + 26,93 % (53,86) = 173,86 €', () => {
    // valeur 100 000 x 8 / 40 = 20 000 ; loi 60 % = 12 000 ; CCT 26,93 % x 20 000 = 5 386
    // payé 17 386 (= 86,93 % de 200,00) ; retenue 20 000 - 17 386 = 2 614
    const r = court(jours8a11, { remunerationMensuelle: 100_000 });
    expect(r.retenue).toBe(2_614);
    expect(r.horsOnss).toBe(17_386);
  });

  it('jours 15 à 30 : seule l’indemnité CCT est due (la mutuelle verse les 60 %), 1 jour = 44,32 €', () => {
    // dimanche 15 mars = jour 14 (loi + CCT) ; lundi 16 mars = jour 15 (CCT seule)
    expect(court([je('2026-03-15')]).demiJoursAPartiel).toBe(2);
    // valeur 2 400,00 x 2 / 40 = 120,00 € (12 000) ; plafond 100,00 € ; part au-dessus 20,00 €
    // CCT : 26,93 % x 100,00 = 26,93 € (2 693) ; 86,93 % x 20,00 = 17,386 -> 17,39 € (1 739) ; total 44,32 €
    const r = court([je('2026-03-16')]);
    expect(r.demiJoursAPartiel).toBe(0);
    expect(r.demiJoursAvecComplement).toBe(2);
    expect(r.demiJoursNonGarantis).toBe(0);
    expect(r.complement).toBe(4_432);
    expect(r.horsOnss).toBe(4_432);
    expect(r.retenue).toBe(7_568);
  });

  it('au-delà du 30e jour : plus rien n’est dû, tout est retranché', () => {
    // mercredi 1er avril = jour 31
    const r = court([je('2026-04-01')]);
    expect(r.demiJoursNonGarantis).toBe(2);
    expect(r.demiJoursAvecComplement).toBe(0);
    expect(r.retenue).toBe(12_000);
  });

  it('un avantage complémentaire déjà payé s’impute sur l’indemnité CCT (art. 9)', () => {
    // complément 177,26 - 50,00 = 127,26 € (12 726) ; payé 24 000 + 12 726 = 36 726 ; retenue 11 274
    const r = court(jours8a11, { avantageComplementaireImputableCentimes: 5_000 });
    expect(r.complement).toBe(12_726);
    expect(r.horsOnss).toBe(36_726);
    expect(r.retenue).toBe(11_274);
  });

  it('accident du travail : 7 jours seulement (art. 72), pas de période à 60 % ni d’indemnité CCT (hors v1)', () => {
    const r = court([je('2026-03-09')], { nature: 'ACCIDENT_TRAVAIL' });
    expect(r.demiJoursNonGarantis).toBe(2);
    expect(r.demiJoursAPartiel).toBe(0);
    expect(r.complement).toBe(0);
    expect(r.retenue).toBe(12_000);
  });
});

describe('calculerSalaireGarantiEmploye : entrées refusées', () => {
  it('refuse plus de jours d’incapacité que le mois n’en compte', () => {
    expect(
      code(() =>
        calculerSalaireGarantiEmploye(
          entreeEmploye([je('2026-04-01'), je('2026-04-02')], { joursReferenceMois: 1 }),
          BLOC,
        ),
      ),
    ).toBe('ABSENCE_SUPERIEURE_AU_MOIS');
  });

  it('refuse les valeurs incohérentes, un doublon ou un jour avant le début', () => {
    for (const e of [
      entreeEmploye([], { remunerationMensuelle: 0 }),
      entreeEmploye([], { joursReferenceMois: 0 }),
      entreeEmploye([], { joursReferenceMois: 1.5 }),
      entreeEmploye([je('2026-04-01', 3)]),
      entreeEmploye([je('2026-04-01', -1)]),
    ]) {
      expect(code(() => calculerSalaireGarantiEmploye(e, BLOC))).toBe('ENTREE_INVALIDE');
    }
    expect(
      code(() =>
        calculerSalaireGarantiEmploye(entreeEmploye([je('2026-04-01'), je('2026-04-01')]), BLOC),
      ),
    ).toBe('JOUR_EN_DOUBLE');
    expect(code(() => calculerSalaireGarantiEmploye(entreeEmploye([je('2026-03-01')]), BLOC))).toBe(
      'JOUR_AVANT_DEBUT_PERIODE',
    );
  });
});

// ---------------------------------------------------------------- rechute, ancienneté, exclusions
describe('calculerSalaireGarantiOuvrier : rechute dans les huit semaines (art. 52 § 2, 1°)', () => {
  it('les jours déjà indemnisés comptent : 3 jours consommés, la rechute du 23 mars reprend au jour 4', () => {
    // 23 mars = jour 4 (3 + 1) : 114,00 € à 100 % ; 27 mars = jour 8 (3 + 5) : 60,00 + 37,90 = 97,90 €
    const jours = [jo('2026-03-23'), jo('2026-03-27')];
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier(jours, { debutPeriodeGarantie: '2026-03-23', joursDejaConsommes: 3 }),
      BLOC,
    );
    expect(r.montant).toBe(21_190);
    // Sans jours consommés, la même rechute repartirait de zéro : 114,00 + 114,00 = 228,00 €
    const neuve = calculerSalaireGarantiOuvrier(
      entreeOuvrier(jours, { debutPeriodeGarantie: '2026-03-23' }),
      BLOC,
    );
    expect(neuve.montant).toBe(22_800);
  });

  it('refuse un nombre de jours consommés négatif, décimal ou supérieur à un an', () => {
    for (const joursDejaConsommes of [-1, 1.5, 366]) {
      expect(
        code(() =>
          calculerSalaireGarantiOuvrier(entreeOuvrier(semaine1, { joursDejaConsommes }), BLOC),
        ),
      ).toBe('ENTREE_INVALIDE');
    }
  });
});

describe('calculerSalaireGarantiEmploye : rechute, ancienneté et exclusions', () => {
  it('rechute : 29 jours déjà consommés, le 2 mars est le jour 30 (payé), le 3 mars le jour 31', () => {
    const r = calculerSalaireGarantiEmploye(
      entreeEmploye([je('2026-03-02'), je('2026-03-03')], { joursDejaConsommes: 29 }),
      BLOC,
    );
    expect(r.demiJoursNonGarantis).toBe(2);
    expect(r.retenue).toBe(12_000);
  });

  it('contrat court, maladie : avant un mois d’ancienneté rien n’est dû (art. 71, al. 2 et art. 52 § 1)', () => {
    // 2, 3 et 4 mars avant l'ancienneté du 5 mars : 6 demi-jours, 2 400,00 x 6 / 40 = 360,00 € retranchés
    const jours = [je('2026-03-02'), je('2026-03-03'), je('2026-03-04'), je('2026-03-05')];
    const court = calculerSalaireGarantiEmploye(
      entreeEmploye(jours, { contrat: 'COURTE_DUREE', dateUnMoisAnciennete: '2026-03-05' }),
      BLOC,
    );
    expect(court.retenue).toBe(36_000);
    expect(court.demiJoursNonGarantis).toBe(6);
  });

  it('pas de condition d’ancienneté pour un contrat long (art. 70) ni pour un accident du travail (art. 72)', () => {
    const jours = [je('2026-03-02')];
    const long = calculerSalaireGarantiEmploye(
      entreeEmploye(jours, { dateUnMoisAnciennete: '2026-03-05' }),
      BLOC,
    );
    expect(long.retenue).toBe(0);
    const at = calculerSalaireGarantiEmploye(
      entreeEmploye(jours, {
        contrat: 'COURTE_DUREE',
        nature: 'ACCIDENT_TRAVAIL',
        dateUnMoisAnciennete: '2026-03-05',
      }),
      BLOC,
    );
    expect(at.retenue).toBe(0);
  });

  it('une exclusion (art. 73 § 2) retire tout le droit, même dans les 30 jours', () => {
    for (const exclusion of ['FAUTE_GRAVE', 'COMPETITION_SPORTIVE_REMUNEREE'] as const) {
      for (const contrat of ['LONGUE_DUREE', 'COURTE_DUREE'] as const) {
        const r = calculerSalaireGarantiEmploye(
          entreeEmploye([je('2026-03-02')], { contrat, exclusion }),
          BLOC,
        );
        expect(r.demiJoursNonGarantis).toBe(2);
        expect(r.retenue).toBe(12_000);
      }
    }
  });

  it('refuse une exclusion de la vie privée sur un accident du travail', () => {
    expect(
      code(() =>
        calculerSalaireGarantiEmploye(
          entreeEmploye([je('2026-03-02')], {
            nature: 'ACCIDENT_TRAVAIL',
            exclusion: 'FAUTE_GRAVE',
          }),
          BLOC,
        ),
      ),
    ).toBe('EXCLUSION_INCOMPATIBLE');
  });
});

// ---------------------------------------------------------------- régime de travail (étape 9a, D111)
describe('plafondEffectifJournalier', () => {
  it('ramène le plafond de l’INAMI au régime de travail : x 6 / jours par semaine', () => {
    // plafond de test 100,00 € = 1 000 000 dix-millièmes
    expect(plafondEffectifJournalier(1_000_000, 6)).toBe(10_000); // 100,00 €
    expect(plafondEffectifJournalier(1_000_000, 5)).toBe(12_000); // 120,00 €
    expect(plafondEffectifJournalier(1_000_000, 4)).toBe(15_000); // 150,00 €
    expect(plafondEffectifJournalier(1_000_000, 3)).toBe(20_000); // 200,00 €
  });

  it('plafond réel de l’INAMI au 01/09/2026 : 189,3583 € à 6 jours = 189,36 € ; à 5 jours = 227,23 €', () => {
    // 189,3583 € = 1 893 583 dix-millièmes ; x 6 / 5 = 227,22996 € -> 227,23 €
    expect(plafondEffectifJournalier(1_893_583, 6)).toBe(18_936);
    expect(plafondEffectifJournalier(1_893_583, 5)).toBe(22_723);
  });

  it('contrôle de la source : 183,1311 € x 26 = 4 761,41 € (plafond mensuel de l’UCM depuis le 01/02/2025)', () => {
    // 1 831 311 dix-millièmes x 26 = 47 614 086 dix-millièmes = 4 761,4086 € -> 4 761,41 €
    expect(arrondirFraction(1_831_311 * 26, 100)).toBe(476_141);
  });

  it('refuse un régime de 0 ou 7 jours, décimal ou qui n’est pas un nombre', () => {
    for (const jours of [0, 7, 5.5, -1, '5' as unknown as number]) {
      expect(code(() => plafondEffectifJournalier(1_000_000, jours))).toBe('ENTREE_INVALIDE');
    }
  });
});

describe('calculerSalaireGarantiOuvrier : régime de 5 jours par semaine', () => {
  it('jours 8 à 12 : le jour à 114,00 € est sous le plafond converti de 120,00 € (aucune part au-dessus)', () => {
    // loi : 60 % x 5 x 114,00 = 342,00 € ; CCT : 25,88 % x 570,00 = 147,516 -> 147,52 € ; total 489,52 €
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier(semaine2, { joursActiviteParSemaine: 5 }),
      BLOC,
    );
    expect(r.montant).toBe(48_952);
    expect(r.lignes).toEqual([
      {
        code: 'SALAIRE_GARANTI_60',
        libelle: 'Salaire garanti à 60 % (plafonné) : 38 h 00',
        base: 57_000,
        taux: 600_000,
        montant: 34_200,
      },
      {
        code: 'COMPLEMENT_CCT_PLAFONNE',
        libelle: 'Indemnité complémentaire CCT 12bis (part sous le plafond)',
        base: 57_000,
        taux: 258_800,
        montant: 14_752,
      },
    ]);
  });

  it('jours 15 à 19 : complément seul, 25,88 % de 570,00 € = 147,52 € (6 jours par semaine : 189,52 €)', () => {
    const cinq = calculerSalaireGarantiOuvrier(
      entreeOuvrier(semaine3, { joursActiviteParSemaine: 5 }),
      BLOC,
    );
    expect(cinq.montant).toBe(14_752);
    // même mois à 6 jours par semaine : 5 x 100,00 sous le plafond (12 940) + 5 x 14,00 au-dessus (6 012)
    const six = calculerSalaireGarantiOuvrier(entreeOuvrier(semaine3), BLOC);
    expect(six.montant).toBe(18_952);
  });

  it('un jour au-dessus du plafond converti : 20,00 €/h = 152,00 € ; plafond 120,00 € à 5 jours, 100,00 € à 6 jours', () => {
    // jour 15 (16 mars) : à 5 jours 25,88 % x 120,00 = 31,056 -> 31,06 ; 85,88 % x 32,00 = 27,4816 -> 27,48 ; total 58,54 €
    // à 6 jours  25,88 % x 100,00 = 25,88 ; 85,88 % x 52,00 = 44,6576 -> 44,66 ; total 70,54 €
    const un = (joursActiviteParSemaine: number) =>
      calculerSalaireGarantiOuvrier(
        entreeOuvrier([jo('2026-03-16')], { tauxHoraireCentimes: 2_000, joursActiviteParSemaine }),
        BLOC,
      ).montant;
    expect(un(5)).toBe(5_854);
    expect(un(6)).toBe(7_054);
  });

  it('refuse un régime absent, nul, supérieur à 6 ou décimal', () => {
    for (const joursActiviteParSemaine of [0, 7, 5.5, undefined as unknown as number]) {
      expect(
        code(() =>
          calculerSalaireGarantiOuvrier(entreeOuvrier(semaine1, { joursActiviteParSemaine }), BLOC),
        ),
      ).toBe('ENTREE_INVALIDE');
    }
  });
});

describe('calculerSalaireGarantiEmploye : régime de 5 jours par semaine', () => {
  const court5 = (
    jours: JourIncapaciteEmploye[],
    extra: Partial<EntreeSalaireGarantiEmploye> = {},
  ) =>
    calculerSalaireGarantiEmploye(
      entreeEmploye(jours, { contrat: 'COURTE_DUREE', joursActiviteParSemaine: 5, ...extra }),
      BLOC,
    );

  it('jour 15 : valeur 120,00 € sous le plafond converti de 120,00 € -> complément 26,93 % = 32,32 €', () => {
    // plafond converti pour 2 demi-jours : 100,00 x 6 x 2 / (2 x 5) = 120,00 € ; 26,93 % x 120,00 = 32,316 -> 32,32 €
    // (à 6 jours par semaine : plafond 100,00 €, complément 44,32 €)
    const r = court5([je('2026-03-16')]);
    expect(r.complement).toBe(3_232);
    expect(r.horsOnss).toBe(3_232);
    expect(r.retenue).toBe(8_768);
  });

  it('salaire de 3 000,00 € : le jour à 150,00 € dépasse le plafond converti de 120,00 €', () => {
    // valeur 3 000,00 x 2 / 40 = 150,00 € ; part sous le plafond 120,00 -> 26,93 % = 32,316 -> 32,32 € ;
    // part au-dessus 30,00 -> 86,93 % = 26,079 -> 26,08 € ; complément 58,40 € ; retenue 150,00 - 58,40 = 91,60 €
    const r = court5([je('2026-03-16')], { remunerationMensuelle: 300_000 });
    expect(r.complement).toBe(5_840);
    expect(r.retenue).toBe(9_160);
  });

  it('refuse un régime absent, nul, supérieur à 6 ou décimal', () => {
    for (const joursActiviteParSemaine of [0, 7, 5.5, undefined as unknown as number]) {
      expect(
        code(() =>
          calculerSalaireGarantiEmploye(
            entreeEmploye([je('2026-03-16')], { joursActiviteParSemaine }),
            BLOC,
          ),
        ),
      ).toBe('ENTREE_INVALIDE');
    }
  });
});
