// Delai pendant lequel un compte "supprime" reste archive et recuperable
// avant purge reelle et definitive. Reference unique partagee entre le hook
// d'archivage (auth.ts), le job de purge (api/cron/purge-deleted-accounts) et
// les textes affiches a l'utilisateur (email, UI).
export const ACCOUNT_DELETION_RETENTION_DAYS = 30;
