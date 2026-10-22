import { describe, expect, it } from 'vitest';
import { moisProposes } from '@/lib/periode/periode-dates';
import {
  dateIsoEnFrancais,
  demiJoursEnTexte,
  libelleMois,
  minutesEnTexte,
  resumePrestation,
  texteEnDemiJours,
  texteEnMinutes,
} from '@/lib/periode/periode-format';
import {
  PRESTATION_VIDE,
  toPrestationFormValues,
  toPrestationPayload,
} from '@/lib/periode/prestation-form';
import { prestationSchema, type PrestationInput } from '@/lib/schemas/prestation';

describe('affichage des périodes', () => {
  it('écrit le mois en français et la date sans décalage de fuseau', () => {
    expect(libelleMois(2026, 11)).toBe('novembre 2026');
    expect(libelleMois(2027, 2)).toBe('février 2027');
    expect(libelleMois(2026, 12)).toBe('décembre 2026');
    expect(dateIsoEnFrancais('2026-11-20')).toBe('20/11/2026');
  });
});

describe('jours et heures saisis à l’écran', () => {
  it('convertit les jours en demi-journées et inversement', () => {
    expect(texteEnDemiJours('1,5')).toBe(3);
    expect(texteEnDemiJours('1.5')).toBe(3);
    expect(texteEnDemiJours('2')).toBe(4);
    expect(texteEnDemiJours('')).toBe(0);
    expect(demiJoursEnTexte(3)).toBe('1,5');
    expect(demiJoursEnTexte(4)).toBe('2');
  });

  it('refuse ce qui n’est pas un multiple de 0,5, négatif ou illisible', () => {
    for (const texte of ['1,3', '-1', 'abc', '1,5,5']) {
      expect(texteEnDemiJours(texte), texte).toBeNaN();
    }
  });

  it('lit les heures en « 7:30 » ou en décimal, et les affiche en « 7:30 »', () => {
    expect(texteEnMinutes('7:30')).toBe(450);
    expect(texteEnMinutes('7,5')).toBe(450);
    expect(texteEnMinutes('152:05')).toBe(9125);
    expect(texteEnMinutes('')).toBeNull();
    expect(minutesEnTexte(450)).toBe('7:30');
    expect(minutesEnTexte(65)).toBe('1:05');
    expect(minutesEnTexte(9125)).toBe('152:05');
  });

  it('refuse des minutes hors de 00 à 59 et ce qui n’est pas un nombre', () => {
    for (const texte of ['7:75', 'abc', '-2']) {
      expect(texteEnMinutes(texte), texte).toBeNaN();
    }
  });
});

describe('résumé des écarts', () => {
  const neutre: PrestationInput = {
    heuresPresteesMinutes: null,
    congeDemiJours: 0,
    maladieDemiJours: 0,
    ferieDemiJours: 0,
    absenceNonRemDemiJours: 0,
    heuresSupMinutes: 0,
    primeCents: null,
    primeLibelle: null,
  };

  it('ne dit rien quand il n’y a aucun écart', () => {
    expect(resumePrestation(neutre)).toEqual([]);
  });

  it('décrit chaque écart, prime comprise', () => {
    expect(
      resumePrestation({
        heuresPresteesMinutes: 9125,
        congeDemiJours: 3,
        maladieDemiJours: 2,
        ferieDemiJours: 1,
        absenceNonRemDemiJours: 4,
        heuresSupMinutes: 90,
        primeCents: 15000,
        primeLibelle: 'Fin d’année',
      }),
    ).toEqual([
      'Heures prestées 152:05',
      'Congé 1,5 j',
      'Maladie 1 j',
      'Férié 0,5 j',
      'Absence non rémunérée 2 j',
      'Heures sup. 1:30',
      'Prime 150,00 € (Fin d’année)',
    ]);
  });
});

// Le formulaire et l'API partagent le même schéma : ce qui passe ici passe au serveur.
describe('formulaire d’encodage', () => {
  const schema = prestationSchema(2026, 11);

  it('un formulaire vide donne « aucun écart »', () => {
    const payload = toPrestationPayload(PRESTATION_VIDE);
    expect(schema.parse(payload)).toEqual({
      heuresPresteesMinutes: null,
      congeDemiJours: 0,
      maladieDemiJours: 0,
      ferieDemiJours: 0,
      absenceNonRemDemiJours: 0,
      heuresSupMinutes: 0,
      primeCents: null,
      primeLibelle: null,
    });
  });

  it('convertit jours, heures et euros en entiers', () => {
    const payload = toPrestationPayload({
      heuresPrestees: '152:30',
      conge: '1,5',
      maladie: '2',
      ferie: '0,5',
      absenceNonRem: '1',
      heuresSup: '1,5',
      primeMontant: '150,5',
      primeLibelle: ' Fin d’année ',
    });
    expect(payload).toMatchObject({
      heuresPresteesMinutes: 9150,
      congeDemiJours: 3,
      maladieDemiJours: 4,
      ferieDemiJours: 1,
      absenceNonRemDemiJours: 2,
      heuresSupMinutes: 90,
      primeCents: 15050,
    });
    expect(schema.safeParse(payload).success).toBe(true);
  });

  it('une valeur illisible est refusée par le schéma, avec le code du champ', () => {
    for (const [champ, valeur, code] of [
      ['conge', '1,3', 'congeDemiJours'],
      ['maladie', 'abc', 'maladieDemiJours'],
      ['heuresSup', '7:99', 'heuresSupMinutes'],
      ['heuresPrestees', 'x', 'heuresPresteesMinutes'],
      ['primeMontant', '12,345', 'primeCents'],
    ] as const) {
      const payload = toPrestationPayload({
        ...PRESTATION_VIDE,
        [champ]: valeur,
        primeLibelle: champ === 'primeMontant' ? 'Prime' : '',
      });
      const result = schema.safeParse(payload);
      expect(result.success, champ).toBe(false);
      if (!result.success) expect(result.error.issues[0].path[0], champ).toBe(code);
    }
  });

  it('préremplit depuis une prestation existante et revient au même corps', () => {
    const existante: PrestationInput = {
      heuresPresteesMinutes: 9150,
      congeDemiJours: 3,
      maladieDemiJours: 0,
      ferieDemiJours: 1,
      absenceNonRemDemiJours: 0,
      heuresSupMinutes: 90,
      primeCents: 15050,
      primeLibelle: 'Fin d’année',
    };
    const valeurs = toPrestationFormValues(existante);
    expect(valeurs).toMatchObject({ conge: '1,5', ferie: '0,5', heuresSup: '1:30', maladie: '' });
    expect(schema.parse(toPrestationPayload(valeurs))).toEqual(existante);
    expect(toPrestationFormValues(null)).toEqual(PRESTATION_VIDE);
  });
});

describe('moisProposes', () => {
  const aujourdhui = new Date('2026-10-22T10:00:00Z');

  it('va du mois suivant en remontant, le plus récent d’abord', () => {
    const mois = moisProposes(aujourdhui, [], 4);
    expect(mois).toEqual([
      { annee: 2026, mois: 11 },
      { annee: 2026, mois: 10 },
      { annee: 2026, mois: 9 },
      { annee: 2026, mois: 8 },
    ]);
  });

  it('écarte les mois qui ont déjà une période et passe le cap de janvier', () => {
    const mois = moisProposes(new Date('2027-01-10T10:00:00Z'), [{ annee: 2027, mois: 1 }], 3);
    expect(mois).toEqual([
      { annee: 2027, mois: 2 },
      { annee: 2026, mois: 12 },
    ]);
  });

  it('n’offre jamais plus loin que le mois suivant', () => {
    for (const m of moisProposes(aujourdhui, [])) {
      expect(m.annee * 12 + m.mois).toBeLessThanOrEqual(2026 * 12 + 11);
    }
  });
});
