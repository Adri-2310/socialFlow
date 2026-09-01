// Delai pendant lequel un Cabinet "archive" par un SuperAdmin reste
// recuperable avant purge reelle et definitive. Meme principe que
// account-retention.ts (comptes utilisateurs), volontairement dans un
// fichier separe : les deux delais peuvent diverger a l'avenir sans lier les
// deux domaines entre eux.
export const CABINET_DELETION_RETENTION_DAYS = 90;
