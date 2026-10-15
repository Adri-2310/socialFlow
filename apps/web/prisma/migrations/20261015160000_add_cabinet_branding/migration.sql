-- D33, D62 : nom affiche et couleurs du cabinet.
ALTER TABLE "cabinet" ADD COLUMN "displayName" TEXT,
ADD COLUMN "primaryColor" TEXT,
ADD COLUMN "secondaryColor" TEXT;
