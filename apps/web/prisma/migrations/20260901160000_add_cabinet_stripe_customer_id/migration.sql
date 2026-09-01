-- AlterTable
ALTER TABLE "cabinet" ADD COLUMN "stripeCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cabinet_stripeCustomerId_key" ON "cabinet"("stripeCustomerId");
