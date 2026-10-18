-- AlterTable
ALTER TABLE "cabinet" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cabinet_slug_key" ON "cabinet"("slug");

