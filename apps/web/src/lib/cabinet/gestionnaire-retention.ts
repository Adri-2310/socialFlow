// D52 : delai pendant lequel un Cabinet RH peut restaurer un gestionnaire qu'il
// a retire. Distinct de ACCOUNT_DELETION_RETENTION_DAYS (purge reelle, 90 jours) :
// passe ce delai, seul le SuperAdmin peut encore restaurer le compte, jusqu'a la purge.
export const GESTIONNAIRE_RESTORE_WINDOW_DAYS = 30;

export function gestionnaireRestoreDeadline(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + GESTIONNAIRE_RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}
