-- AlterTable
ALTER TABLE "invitation" ADD COLUMN     "salarieId" TEXT;

-- CreateIndex
CREATE INDEX "invitation_salarieId_idx" ON "invitation"("salarieId");

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_salarieId_fkey" FOREIGN KEY ("salarieId") REFERENCES "salarie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
