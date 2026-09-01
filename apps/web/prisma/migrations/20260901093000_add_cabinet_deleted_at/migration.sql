-- AlterTable
ALTER TABLE "cabinet" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "cabinet_deletedAt_idx" ON "cabinet"("deletedAt");
