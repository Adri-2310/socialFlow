-- D33, D62 : logo du cabinet, stocke hors base (URL publique + chemin).
ALTER TABLE "cabinet" ADD COLUMN "logoUrl" TEXT,
ADD COLUMN "logoPath" TEXT;
