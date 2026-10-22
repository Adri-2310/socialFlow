import { ERROR_MESSAGES } from '@/lib/salarie/form-messages';

// Messages des formulaires des périodes et des prestations. Sans dépendance côté serveur :
// importé par des composants client.

export { FALLBACK } from '@/lib/salarie/form-messages';

// Message d'une erreur de la route (bandeau du formulaire ou de la ligne).
export const PERIODE_ERROR_MESSAGES: Record<string, string> = {
  ...ERROR_MESSAGES,
  PERIODE_NOT_FOUND: 'Cette période est introuvable.',
  PERIODE_ALREADY_EXISTS: 'Une période existe déjà pour ce mois.',
  PERIODE_LOCKED: 'Les prestations de cette période sont verrouillées : déverrouillez-les d’abord.',
  PERIODE_ALREADY_LOCKED: 'Ces prestations sont déjà verrouillées.',
  PERIODE_NOT_LOCKED: 'Ces prestations ne sont pas verrouillées.',
  DEADLINE_PASSED: 'La date limite est dépassée : seul le gestionnaire peut encore modifier.',
  SALARIE_NOT_ACTIVE_IN_PERIOD: 'Ce salarié n’est pas en poste pendant ce mois.',
};

// Message affiché sous un champ, d'après le code renvoyé par le schéma ou par l'API.
export const PERIODE_FIELD_ERRORS: Record<string, string> = {
  PERIODE_OUT_OF_RANGE:
    'On peut ouvrir un mois passé, le mois courant ou le mois suivant, pas plus loin.',
  INVALID_MOIS: 'Mois invalide.',
  INVALID_ANNEE: 'Année invalide.',
  INVALID_DATE_LIMITE: 'Date invalide.',
  INVALID_HEURES_PRESTEES_MINUTES:
    'Heures invalides : « 7:30 » ou « 7,5 », sans dépasser les heures du mois.',
  INVALID_CONGE_DEMI_JOURS: 'Nombre de jours invalide : par pas de 0,5, sans dépasser le mois.',
  INVALID_MALADIE_DEMI_JOURS: 'Nombre de jours invalide : par pas de 0,5, sans dépasser le mois.',
  INVALID_FERIE_DEMI_JOURS: 'Nombre de jours invalide : par pas de 0,5, sans dépasser le mois.',
  INVALID_ABSENCE_NON_REM_DEMI_JOURS:
    'Nombre de jours invalide : par pas de 0,5, sans dépasser le mois.',
  INVALID_HEURES_SUP_MINUTES:
    'Heures invalides : « 1:30 » ou « 1,5 », sans dépasser les heures du mois.',
  INVALID_PRIME_CENTS: 'Montant invalide, ou à saisir avec son libellé (ex. 150,00).',
  INVALID_PRIME_LIBELLE: 'Le libellé de la prime est obligatoire (60 caractères au plus).',
};
