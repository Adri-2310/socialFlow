// Messages et petits utilitaires communs aux formulaires du gestionnaire (dossier et
// conditions de travail). Sans dépendance côté serveur : importé par des composants client.

// Message affiché sous un champ, d'après le code renvoyé par le schéma ou par l'API.
export const FIELD_ERRORS: Record<string, string> = {
  INVALID_NOM: 'Le nom est obligatoire.',
  INVALID_PRENOM: 'Le prénom est obligatoire.',
  INVALID_DATE_NAISSANCE: 'Date de naissance invalide, ou postérieure à la date d’entrée.',
  INVALID_DATE_EFFET:
    'La date d’effet est obligatoire, et celle d’une ligne existante ne se change pas.',
  DATE_EFFET_OUT_OF_RANGE:
    'La date doit se situer entre la date d’entrée et la date de sortie du salarié.',
  CONDITION_DATE_ALREADY_USED:
    'Une condition existe déjà à cette date : corrigez-la plutôt que d’en ajouter une.',
  DATE_SORTIE_OUT_OF_RANGE: 'La date de sortie ne peut pas précéder la date d’entrée.',
  CONDITION_AFTER_SORTIE:
    'Une condition de travail est datée après cette sortie : annulez-la d’abord.',
  INVALID_NISS: 'NISS invalide : 11 chiffres avec une clé de contrôle correcte.',
  DATE_ENTREE_CONFLICT:
    'Une condition de travail est datée avant cette entrée (ou le même jour), ou l’entrée suit la date de sortie.',
  NISS_ALREADY_USED:
    'Un salarié de cette entreprise porte déjà ce NISS (peut-être archivé : restaurez-le plutôt).',
  INVALID_IBAN: 'IBAN belge invalide (BE suivi de 14 chiffres, clé de contrôle comprise).',
  INVALID_EMAIL: 'Adresse email invalide.',
  INVALID_PAYS: 'Pays invalide.',
  INVALID_DATE_ENTREE: 'Date d’entrée manquante ou invalide (JJ/MM/AAAA).',
  INVALID_DATE_FIN_CONTRAT:
    'Un CDD exige une date de fin postérieure à l’entrée ; un CDI n’en a pas.',
  INVALID_DATE_SORTIE: 'La date de sortie se saisit à la sortie du salarié.',
  INVALID_FONCTION: 'La fonction est obligatoire.',
  INVALID_COMMISSION_PARITAIRE: 'Commission paritaire incohérente avec le statut.',
  INVALID_HEURES_SEMAINE:
    'Heures par semaine obligatoires à temps partiel, sans dépasser celles de la référence.',
  INVALID_HEURES_REFERENCE: 'Heures de la personne de référence obligatoires à temps partiel.',
  INVALID_SALAIRE_MENSUEL_BRUT_CENTS: 'Montant invalide (par exemple 2850,00).',
  INVALID_SALAIRE_HORAIRE_BRUT_CENTS: 'Montant invalide (par exemple 17,25).',
  INVALID_SITUATION_FAMILIALE: 'Situation familiale invalide.',
  INVALID_CONJOINT_AVEC_REVENUS: 'Précisez si le conjoint ou cohabitant a des revenus.',
  INVALID_PERSONNES_CHARGE: 'Nombre de personnes à charge invalide (0 à 20).',
};

export const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Session expirée. Reconnectez-vous.',
  FORBIDDEN: "Vous n'êtes pas autorisé à effectuer cette action.",
  ENTREPRISE_NOT_FOUND: 'Cette entreprise est introuvable.',
  SALARIE_NOT_FOUND: 'Ce dossier est introuvable.',
  SALARIE_HAS_NO_EMAIL:
    'Ce dossier n’a pas d’adresse email : ajoutez-la d’abord (bouton « Modifier »).',
  SALARIE_ALREADY_HAS_ACCOUNT: 'Ce salarié a déjà un compte.',
  EMAIL_ALREADY_USED: 'Cette adresse est déjà utilisée par un autre compte.',
  INVITATION_ALREADY_PENDING: 'Une autre invitation est déjà en attente pour cette adresse.',
  INVITATION_NOT_FOUND: 'Aucune invitation en attente pour ce dossier.',
  SALARIE_ALREADY_ARCHIVED: 'Ce dossier est déjà archivé.',
  SALARIE_NOT_ARCHIVED: 'Ce dossier n’est pas archivé.',
  CONDITION_NOT_FOUND: 'Cette condition est introuvable.',
  CONDITION_NOT_REMOVABLE:
    'Seul un changement à venir peut être annulé (jamais la première ligne, ni une ligne déjà en vigueur).',
  DECRYPTION_FAILED: 'Cette valeur est illisible : contactez le support.',
  INVALID_FIELD: 'Champ inconnu.',
  CABINET_READ_ONLY:
    'Votre cabinet est en lecture seule : plus rien ne peut être modifié pour le moment.',
};

export const FALLBACK = 'Une erreur est survenue. Veuillez réessayer.';

export const blank = (value: string) => value.trim() || undefined;
export const number = (value: string) =>
  value.trim() ? Number(value.replace(',', '.')) : undefined;
