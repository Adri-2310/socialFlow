-- AlterTable
ALTER TABLE "account" ADD COLUMN "issuer" TEXT;

-- DataMigration: better-auth 1.7 introduit "issuer" comme namespace pour les
-- methodes d'authentification sans issuer OIDC reel. Les comptes existants
-- suivent la meme convention que better-auth applique aux nouveaux comptes
-- (voir @better-auth/core/dist/db/schema/account.mjs) : "local:credential"
-- pour l'email/mot de passe, "local:oauth:<providerId>" pour les fournisseurs
-- sociaux (google, microsoft).
UPDATE "account" SET "issuer" = 'local:credential' WHERE "providerId" = 'credential';
UPDATE "account" SET "issuer" = 'local:oauth:' || "providerId" WHERE "providerId" != 'credential';

-- AlterTable
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;
