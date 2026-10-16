-- AlterTable
ALTER TABLE "entreprise" ADD COLUMN     "adminUserId" TEXT;

-- AlterTable
ALTER TABLE "invitation" ADD COLUMN     "entrepriseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "entreprise_adminUserId_key" ON "entreprise"("adminUserId");

-- CreateIndex
CREATE INDEX "invitation_entrepriseId_idx" ON "invitation"("entrepriseId");

-- AddForeignKey
ALTER TABLE "entreprise" ADD CONSTRAINT "entreprise_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "entreprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

