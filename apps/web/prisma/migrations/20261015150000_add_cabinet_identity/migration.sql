-- D30 : identite du cabinet (TVA, adresse, contact), affichee a ses clients.
ALTER TABLE "cabinet" ADD COLUMN "vatNumber" TEXT,
ADD COLUMN "addressLine" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "country" TEXT NOT NULL DEFAULT 'BE',
ADD COLUMN "contactEmail" TEXT,
ADD COLUMN "contactPhone" TEXT;
