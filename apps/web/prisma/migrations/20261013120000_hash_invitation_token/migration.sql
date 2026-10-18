-- C3 (doc/roles/02-cabinet-rh.md § 7) : le jeton d'invitation n'est plus
-- stocke en clair. On conserve sha256(jeton) en hexadecimal ; le jeton en clair
-- n'existe plus que dans l'email. Les invitations deja envoyees restent
-- utilisables : leur jeton est hache en place avec le meme algorithme que
-- l'application (lib/invitations.ts).
ALTER TABLE "invitation" RENAME COLUMN "token" TO "tokenHash";

UPDATE "invitation"
SET "tokenHash" = encode(sha256(convert_to("tokenHash", 'UTF8')), 'hex');

ALTER INDEX "invitation_token_key" RENAME TO "invitation_tokenHash_key";

-- Index redondant avec la contrainte d'unicite ci-dessus.
DROP INDEX "invitation_token_idx";
