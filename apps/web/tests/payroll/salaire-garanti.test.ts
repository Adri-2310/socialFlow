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
} from '@/lib/payroll/salaire-garanti';
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

  it('deuxième semaine à 60 % plafonné : 5 x min(114,00 ; 100,00) x 60 % = 300,00 €', () => {
    // base = 5 x 10 000 = 50 000 (la part au-dessus du plafond est exclue) ; 60 % = 30 000
    const r = calculerSalaireGarantiOuvrier(entreeOuvrier(semaine2), BLOC);
    expect(r.montant).toBe(30_000);
    expect(r.lignes).toEqual([
      {
        code: 'SALAIRE_GARANTI_60',
        libelle: 'Salaire garanti à 60 % (plafonné) : 38 h 00',
        base: 50_000,
        taux: 600_000,
        montant: 30_000,
      },
    ]);
  });

  it('seuls les jours à 100 % entrent dans la base ONSS (ONSS 2026/3, p. 115)', () => {
    expect(calculerSalaireGarantiOuvrier(entreeOuvrier(semaine1), BLOC).baseOnss).toBe(57_000);
    expect(calculerSalaireGarantiOuvrier(entreeOuvrier(semaine2), BLOC).baseOnss).toBe(0);
    // un mois sur trois semaines : 570,00 € à 100 % soumis à l'ONSS, 300,00 € à 60 % exclus
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier([...semaine1, ...semaine2, ...semaine3]),
      BLOC,
    );
    expect(r.montant).toBe(87_000);
    expect(r.baseOnss).toBe(57_000);
  });

  it('sous le plafond, 60 % de la rémunération : 10,00 €/h -> 76,00 € par jour, 5 jours à 60 % = 228,00 €', () => {
    // 1 000 x 456 / 60 = 7 600 par jour ; 5 jours = 38 000 ; 60 % = 22 800
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier(semaine2, { tauxHoraireCentimes: 1_000 }),
      BLOC,
    );
    expect(r.montant).toBe(22_800);
  });

  it('un mois sur trois semaines : 570,00 + 300,00 = 870,00 € ; plus rien dès le jour 15', () => {
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier([...semaine1, ...semaine2, ...semaine3]),
      BLOC,
    );
    expect(r.montant).toBe(87_000);
    expect(r.lignes.map((l) => l.code)).toEqual(['SALAIRE_GARANTI_100', 'SALAIRE_GARANTI_60']);
  });

  it('les limites : jour 7 à 100 %, jour 8 à 60 %, jour 14 à 60 %, jour 15 à 0', () => {
    const un = (date: string) =>
      calculerSalaireGarantiOuvrier(entreeOuvrier([jo(date)]), BLOC).montant;
    expect(un('2026-03-08')).toBe(11_400); // jour 7
    expect(un('2026-03-09')).toBe(6_000); // jour 8 : 60 % x 100,00
    expect(un('2026-03-15')).toBe(6_000); // jour 14
    expect(un('2026-03-16')).toBe(0); // jour 15
  });

  it('un jour sans activité (0 minute) ne rapporte rien mais compte dans la période (art. 56)', () => {
    // samedi 7 et dimanche 8 sans activité : le lundi 9 reste le jour 8
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier([jo('2026-03-07', 0), jo('2026-03-08', 0), jo('2026-03-09')]),
      BLOC,
    );
    expect(r.montant).toBe(6_000);
  });

  it('un jour déjà rémunéré (jour férié) compte dans la période mais n’est pas payé deux fois', () => {
    // mercredi 4 mars déjà payé ailleurs : 4 jours x 114,00 = 456,00 €
    const jours = semaine1.map((j) => (j.date === '2026-03-04' ? jo(j.date, 456, true) : j));
    expect(calculerSalaireGarantiOuvrier(entreeOuvrier(jours), BLOC).montant).toBe(45_600);
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
      expect(r).toEqual({ montant: 0, baseOnss: 0, lignes: [] });
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
      demiJoursNonGarantis: 0,
      demiJoursAPartiel: 0,
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

describe('calculerSalaireGarantiEmploye : contrat de moins de 3 mois (art. 71 et 72)', () => {
  const court = (
    jours: JourIncapaciteEmploye[],
    extra: Partial<EntreeSalaireGarantiEmploye> = {},
  ) =>
    calculerSalaireGarantiEmploye(
      entreeEmploye(jours, { contrat: 'COURTE_DUREE', ...extra }),
      BLOC,
    );

  it('jours 1 à 7 : rien à retrancher', () => {
    expect(court([je('2026-03-06'), je('2026-03-08')]).retenue).toBe(0);
  });

  it('jours 8 à 11 (4 jours = 8 demi-jours) à 60 % plafonné : retenue de 240,00 €', () => {
    // valeur 2 400,00 x 8 / 40 = 480,00 € ; plafond 100,00 x 8 / 2 = 400,00 € ; payé 60 % x 400,00 = 240,00 €
    const r = court([je('2026-03-09'), je('2026-03-10'), je('2026-03-11'), je('2026-03-12')]);
    expect(r.retenue).toBe(24_000);
    expect(r.demiJoursAPartiel).toBe(8);
    expect(r.lignes).toEqual([
      {
        code: 'SALAIRE_GARANTI_60_RETENUE',
        libelle: 'Salaire garanti à 60 % (plafonné) : 4 jours sur 20',
        base: 48_000,
        taux: 600_000,
        montant: -24_000,
      },
    ]);
  });

  it('le salaire versé à 60 % est exclu de la base ONSS : 240,00 € ; contrat long : rien', () => {
    // valeur 480,00 ; plafond 400,00 ; payé 60 % x 400,00 = 240,00 € (24 000), retenue 240,00 €
    const r = court([je('2026-03-09'), je('2026-03-10'), je('2026-03-11'), je('2026-03-12')]);
    expect(r.horsOnss).toBe(24_000);
    expect(calculerSalaireGarantiEmploye(entreeEmploye([je('2026-04-01')]), BLOC).horsOnss).toBe(0);
  });

  it('sous le plafond, 60 % de la valeur : 1 000,00 € -> 8 demi-jours = 200,00 €, payé 120,00 €, retenue 80,00 €', () => {
    const r = court([je('2026-03-09'), je('2026-03-10'), je('2026-03-11'), je('2026-03-12')], {
      remunerationMensuelle: 100_000,
    });
    expect(r.retenue).toBe(8_000);
  });

  it('au-delà du 14e jour : plus rien n’est dû, tout est retranché', () => {
    // dimanche 15 mars = jour 14 (à 60 %) ; lundi 16 mars = jour 15
    const r = court([je('2026-03-16')]);
    expect(r.demiJoursNonGarantis).toBe(2);
    expect(r.retenue).toBe(12_000);
    expect(court([je('2026-03-15')]).demiJoursAPartiel).toBe(2);
  });

  it('accident du travail : 7 jours seulement (art. 72), pas de période à 60 %', () => {
    const r = court([je('2026-03-09')], { nature: 'ACCIDENT_TRAVAIL' });
    expect(r.demiJoursNonGarantis).toBe(2);
    expect(r.demiJoursAPartiel).toBe(0);
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
    // 23 mars = jour 4 (3 + 1) : 114,00 € à 100 % ; 27 mars = jour 8 (3 + 5) : 60 % x 100,00 = 60,00 €
    const jours = [jo('2026-03-23'), jo('2026-03-27')];
    const r = calculerSalaireGarantiOuvrier(
      entreeOuvrier(jours, { debutPeriodeGarantie: '2026-03-23', joursDejaConsommes: 3 }),
      BLOC,
    );
    expect(r.montant).toBe(17_400);
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
