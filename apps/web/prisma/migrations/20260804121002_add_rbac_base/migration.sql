-- AlterTable
ALTER TABLE "user" ADD COLUMN     "cabinetId" TEXT,
ALTER COLUMN "role" SET DEFAULT 'CABINET_RH';

-- CreateTable
CREATE TABLE "cabinet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cabinet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cabinetId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_token_key" ON "invitation"("token");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE INDEX "invitation_token_idx" ON "invitation"("token");

-- CreateIndex
CREATE INDEX "user_cabinetId_idx" ON "user"("cabinetId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: aligne les roles existants sur la nouvelle nomenclature et
-- cree retroactivement un Cabinet pour chaque Cabinet RH qui n'en a pas
-- encore (comptes crees avant l'introduction du multi-tenant).
UPDATE "user" SET "role" = 'CABINET_RH' WHERE "role" = 'cabinet';

DO $$
DECLARE
  u RECORD;
  new_cabinet_id TEXT;
BEGIN
  FOR u IN SELECT id, name FROM "user" WHERE "role" = 'CABINET_RH' AND "cabinetId" IS NULL LOOP
    new_cabinet_id := gen_random_uuid()::text;
    INSERT INTO "cabinet" (id, name, "createdAt", "updatedAt")
    VALUES (new_cabinet_id, 'Cabinet de ' || u.name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    UPDATE "user" SET "cabinetId" = new_cabinet_id WHERE id = u.id;
  END LOOP;
END $$;
