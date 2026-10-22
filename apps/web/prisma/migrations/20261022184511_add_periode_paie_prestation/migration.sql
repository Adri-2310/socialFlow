-- CreateTable
CREATE TABLE "periode_paie" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "entrepriseId" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "mois" INTEGER NOT NULL,
    "statut" TEXT NOT NULL,
    "dateLimite" DATE NOT NULL,
    "ouverteParId" TEXT,
    "verrouilleeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periode_paie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prestation" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "salarieId" TEXT NOT NULL,
    "heuresPresteesMinutes" INTEGER,
    "congeDemiJours" INTEGER NOT NULL DEFAULT 0,
    "maladieDemiJours" INTEGER NOT NULL DEFAULT 0,
    "ferieDemiJours" INTEGER NOT NULL DEFAULT 0,
    "absenceNonRemDemiJours" INTEGER NOT NULL DEFAULT 0,
    "heuresSupMinutes" INTEGER NOT NULL DEFAULT 0,
    "primeCents" INTEGER,
    "primeLibelle" TEXT,
    "modifieParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "periode_paie_cabinetId_idx" ON "periode_paie"("cabinetId");

-- CreateIndex
CREATE UNIQUE INDEX "periode_paie_entrepriseId_annee_mois_key" ON "periode_paie"("entrepriseId", "annee", "mois");

-- CreateIndex
CREATE INDEX "prestation_cabinetId_idx" ON "prestation"("cabinetId");

-- CreateIndex
CREATE INDEX "prestation_salarieId_idx" ON "prestation"("salarieId");

-- CreateIndex
CREATE UNIQUE INDEX "prestation_periodeId_salarieId_key" ON "prestation"("periodeId", "salarieId");

-- AddForeignKey
ALTER TABLE "periode_paie" ADD CONSTRAINT "periode_paie_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periode_paie" ADD CONSTRAINT "periode_paie_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "entreprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periode_paie" ADD CONSTRAINT "periode_paie_ouverteParId_fkey" FOREIGN KEY ("ouverteParId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestation" ADD CONSTRAINT "prestation_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestation" ADD CONSTRAINT "prestation_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "periode_paie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestation" ADD CONSTRAINT "prestation_salarieId_fkey" FOREIGN KEY ("salarieId") REFERENCES "salarie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestation" ADD CONSTRAINT "prestation_modifieParId_fkey" FOREIGN KEY ("modifieParId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
