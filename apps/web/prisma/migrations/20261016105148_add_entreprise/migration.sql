-- CreateTable
CREATE TABLE "entreprise" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vatNumber" TEXT NOT NULL,
    "addressLine" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'BE',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entreprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gestionnaire_entreprise" (
    "entrepriseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gestionnaire_entreprise_pkey" PRIMARY KEY ("entrepriseId","userId")
);

-- CreateIndex
CREATE INDEX "entreprise_cabinetId_deletedAt_idx" ON "entreprise"("cabinetId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "entreprise_cabinetId_vatNumber_key" ON "entreprise"("cabinetId", "vatNumber");

-- CreateIndex
CREATE INDEX "gestionnaire_entreprise_userId_idx" ON "gestionnaire_entreprise"("userId");

-- AddForeignKey
ALTER TABLE "entreprise" ADD CONSTRAINT "entreprise_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestionnaire_entreprise" ADD CONSTRAINT "gestionnaire_entreprise_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "entreprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gestionnaire_entreprise" ADD CONSTRAINT "gestionnaire_entreprise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
