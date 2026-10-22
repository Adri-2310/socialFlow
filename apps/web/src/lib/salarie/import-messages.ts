import { FIELD_ERRORS } from '@/lib/salarie/form-messages';

// Messages en français du rapport d'import CSV (roles/03 § 4.1). Sans dépendance côté serveur :
// importé par le composant client. Le serveur ne renvoie que des codes.

// Erreur qui empêche d'analyser le fichier (rien n'est lu ligne par ligne).
export function messageEchec(erreur: string, colonnes?: string[]): string {
  const liste = colonnes?.join(', ') ?? '';
  switch (erreur) {
    case 'IMPORT_EMPTY':
      return 'Le fichier ne contient aucune ligne de données.';
    case 'IMPORT_TOO_LARGE':
      return 'Le fichier dépasse 1 Mo : découpez-le en plusieurs imports.';
    case 'IMPORT_TOO_MANY_ROWS':
      return 'Le fichier dépasse 200 lignes : découpez-le en plusieurs imports.';
    case 'CSV_INVALID':
      return 'Fichier illisible : un guillemet n’est pas refermé.';
    case 'MISSING_COLUMNS':
      return `Colonnes obligatoires manquantes : ${liste}. Partez du modèle téléchargeable.`;
    case 'UNKNOWN_COLUMNS':
      return `Colonnes inconnues : ${liste}. Partez du modèle téléchargeable.`;
    case 'DUPLICATE_COLUMNS':
      return `Colonnes en double : ${liste}.`;
    case 'ENTREPRISE_NOT_FOUND':
      return 'Cette entreprise est introuvable.';
    case 'CABINET_READ_ONLY':
      return 'Votre cabinet est en lecture seule : plus rien ne peut être modifié pour le moment.';
    case 'FORBIDDEN':
      return 'Vous n’êtes pas autorisé à effectuer cette action.';
    case 'UNAUTHORIZED':
      return 'Session expirée. Reconnectez-vous.';
    default:
      return 'Une erreur est survenue. Veuillez réessayer.';
  }
}

// Problème d'une cellule : le code du schéma de création, ou un code propre à l'import.
export function messageErreurLigne(code: string): string {
  if (code === 'COLONNES_EN_TROP') {
    return 'Plus de valeurs que de colonnes (un séparateur en trop ?).';
  }
  return FIELD_ERRORS[code] ?? 'Valeur invalide.';
}

export function messageIgnoree(raison: string): string {
  switch (raison) {
    case 'NISS_DEJA_PRESENT':
      return 'Un salarié de l’entreprise porte déjà ce NISS : ligne ignorée.';
    case 'NISS_ARCHIVE':
      return 'Ce NISS appartient à un dossier archivé : restaurez-le (onglet Archivés) plutôt que de le recréer.';
    case 'NISS_DOUBLON_FICHIER':
      return 'Ce NISS figure déjà plus haut dans le fichier : ligne ignorée.';
    default:
      return 'Ligne ignorée.';
  }
}
