-- CreateTable
CREATE TABLE "bareme_version" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "valideDepuis" DATE NOT NULL,
    "valideJusqua" DATE,
    "statut" TEXT NOT NULL,
    "categorieEmployeur" TEXT NOT NULL,
    "parametres" JSONB NOT NULL,
    "source" JSONB NOT NULL,
    "creeParId" TEXT,
    "activeParId" TEXT,
    "activeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bareme_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bareme_version_code_key" ON "bareme_version"("code");

-- CreateIndex
CREATE INDEX "bareme_version_statut_valideDepuis_idx" ON "bareme_version"("statut", "valideDepuis");

-- AddForeignKey
ALTER TABLE "bareme_version" ADD CONSTRAINT "bareme_version_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bareme_version" ADD CONSTRAINT "bareme_version_activeParId_fkey" FOREIGN KEY ("activeParId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
