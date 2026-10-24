import { describe, expect, it } from 'vitest';
import { minutesEnLibelle } from '@/lib/periode/periode-format';
import { toConditionFormValues, toConditionPayload } from '@/lib/salarie/condition-form';
import type { ConditionRow } from '@/lib/salarie/salarie-data';
import { conditionTravailSchema } from '@/lib/schemas/salarie';

// Heures hebdomadaires du temps partiel (D96) : l'écran parle en heures, la base en minutes.

const ligne = (changes: Partial<ConditionRow> = {}): ConditionRow => ({
  id: 'c1',
  dateEffet: new Date('2026-11-01'),
  statut: 'EMPLOYE',
  commissionParitaire: '200',
  fonction: 'Comptable',
  regime: 'TEMPS_PARTIEL',
  heuresSemaineMinutes: 1824,
  heuresReferenceMinutes: 2280,
  salaireMensuelBrutCents: 280000,
  salaireHoraireBrutCents: null,
  etat: 'EN_VIGUEUR',
  ...changes,
});

describe('libellé d’une durée hebdomadaire', () => {
  it('écrit les heures et les minutes, sans minutes quand le compte est rond', () => {
    expect(minutesEnLibelle(1824)).toBe('30 h 24');
    expect(minutesEnLibelle(2280)).toBe('38 h');
    expect(minutesEnLibelle(1805)).toBe('30 h 05');
    expect(minutesEnLibelle(45)).toBe('0 h 45');
    expect(minutesEnLibelle(3600)).toBe('60 h');
  });
});

describe('formulaire d’une condition : heures saisies, minutes envoyées', () => {
  it('préremplit les minutes enregistrées en « heures:minutes »', () => {
    const valeurs = toConditionFormValues(ligne(), { avecDate: true });
    expect(valeurs).toMatchObject({ heuresSemaine: '30:24', heuresReference: '38:00' });
  });

  it('un temps plein n’a pas d’heures à afficher', () => {
    const valeurs = toConditionFormValues(
      ligne({ regime: 'TEMPS_PLEIN', heuresSemaineMinutes: null, heuresReferenceMinutes: null }),
      { avecDate: false },
    );
    expect(valeurs).toMatchObject({ heuresSemaine: '', heuresReference: '' });
  });

  it('convertit les écritures usuelles en minutes', () => {
    const base = toConditionFormValues(ligne(), { avecDate: true });
    const minutes = (semaine: string) =>
      toConditionPayload({ ...base, heuresSemaine: semaine, heuresReference: '38' })
        .heuresSemaineMinutes;
    expect(minutes('30:24')).toBe(1824);
    expect(minutes('30,4')).toBe(1824);
    expect(minutes('30.4')).toBe(1824);
    expect(minutes('19')).toBe(1140);
    expect(minutes('38,333')).toBe(2300);
    expect(minutes('')).toBeUndefined();
    expect(minutes('beaucoup')).toBeNaN();
  });

  it('ne renvoie aucune durée à temps plein, même si le champ garde une valeur', () => {
    const base = toConditionFormValues(ligne(), { avecDate: true });
    const payload = toConditionPayload({ ...base, regime: 'TEMPS_PLEIN' });
    expect(payload.heuresSemaineMinutes).toBeUndefined();
    expect(payload.heuresReferenceMinutes).toBeUndefined();
  });

  it('ce que le formulaire renvoie après préremplissage est accepté par le schéma', () => {
    const payload = toConditionPayload(toConditionFormValues(ligne(), { avecDate: true }));
    expect(conditionTravailSchema.safeParse(payload).success).toBe(true);
    expect(payload).toMatchObject({ heuresSemaineMinutes: 1824, heuresReferenceMinutes: 2280 });
  });

  it('une saisie illisible est refusée par le schéma avec le code du champ', () => {
    const base = toConditionFormValues(ligne(), { avecDate: true });
    const resultat = conditionTravailSchema.safeParse(
      toConditionPayload({ ...base, heuresSemaine: 'beaucoup' }),
    );
    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues[0].path[0]).toBe('heuresSemaineMinutes');
  });
});
