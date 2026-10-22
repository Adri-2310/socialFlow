import type { ConditionRow } from '@/lib/salarie/salarie-data';
import { centsToInput, parseEurosToCents } from '@/lib/salarie/montant';
import { number } from '@/lib/salarie/form-messages';

// Valeurs du formulaire d'une condition de travail datée : tout en chaînes, comme les champs
// de saisie. Partagé entre le formulaire (composant client) et la fiche qui le préremplit.
export type ConditionFormValues = {
  dateEffet: string;
  statut: 'EMPLOYE' | 'OUVRIER';
  fonction: string;
  regime: 'TEMPS_PLEIN' | 'TEMPS_PARTIEL';
  heuresSemaine: string;
  heuresReference: string;
  salaire: string; // en euros : mensuel pour un employé, horaire pour un ouvrier
};

const iso = (date: Date) => date.toISOString().slice(0, 10);
const heures = (valeur: number | null) => (valeur === null ? '' : String(valeur).replace('.', ','));

// Préremplit depuis une ligne existante (correction) ou depuis la condition en vigueur
// (ajout : même valeurs, la date reste à saisir).
export function toConditionFormValues(
  condition: ConditionRow,
  options: { avecDate: boolean },
): ConditionFormValues {
  const cents =
    condition.statut === 'EMPLOYE'
      ? condition.salaireMensuelBrutCents
      : condition.salaireHoraireBrutCents;
  return {
    dateEffet: options.avecDate ? iso(condition.dateEffet) : '',
    statut: condition.statut as ConditionFormValues['statut'],
    fonction: condition.fonction,
    regime: condition.regime as ConditionFormValues['regime'],
    heuresSemaine: heures(condition.heuresSemaine),
    heuresReference: heures(condition.heuresReference),
    salaire: cents === null ? '' : centsToInput(cents),
  };
}

// Même corps que l'API attend (même schéma Zod, CONVENTIONS § 5). Un montant illisible
// devient NaN : le schéma le refuse avec le code du champ.
export function toConditionPayload(f: ConditionFormValues) {
  const cents = f.salaire.trim() ? (parseEurosToCents(f.salaire) ?? Number.NaN) : undefined;
  return {
    dateEffet: f.dateEffet,
    statut: f.statut,
    // D44 : CP 200 pour les employés, CP 100 pour les ouvriers.
    commissionParitaire: f.statut === 'EMPLOYE' ? '200' : '100',
    fonction: f.fonction,
    regime: f.regime,
    heuresSemaine: f.regime === 'TEMPS_PARTIEL' ? number(f.heuresSemaine) : undefined,
    heuresReference: f.regime === 'TEMPS_PARTIEL' ? number(f.heuresReference) : undefined,
    salaireMensuelBrutCents: f.statut === 'EMPLOYE' ? cents : undefined,
    salaireHoraireBrutCents: f.statut === 'OUVRIER' ? cents : undefined,
  };
}
