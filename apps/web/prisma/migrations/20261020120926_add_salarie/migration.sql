-- CreateTable
CREATE TABLE "salarie" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "entrepriseId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "dateNaissance" DATE NOT NULL,
    "adresse" TEXT,
    "codePostal" TEXT,
    "ville" TEXT,
    "pays" TEXT NOT NULL DEFAULT 'BE',
    "email" TEXT,
    "nissEncrypted" TEXT NOT NULL,
    "nissHash" TEXT NOT NULL,
    "ibanEncrypted" TEXT NOT NULL,
    "typeContrat" TEXT NOT NULL,
    "dateEntree" DATE NOT NULL,
    "dateFinContrat" DATE,
    "dateSortie" DATE,
    "situationFamiliale" TEXT NOT NULL,
    "conjointAvecRevenus" BOOLEAN,
    "personnesCharge" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salarie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condition_travail" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "salarieId" TEXT NOT NULL,
    "dateEffet" DATE NOT NULL,
    "statut" TEXT NOT NULL,
    "commissionParitaire" TEXT NOT NULL,
    "fonction" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "heuresSemaine" DOUBLE PRECISION,
    "heuresReference" DOUBLE PRECISION,
    "salaireMensuelBrutCents" INTEGER,
    "salaireHoraireBrutCents" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "condition_travail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salarie_userId_key" ON "salarie"("userId");

-- CreateIndex
CREATE INDEX "salarie_cabinetId_idx" ON "salarie"("cabinetId");

-- CreateIndex
CREATE INDEX "salarie_entrepriseId_deletedAt_idx" ON "salarie"("entrepriseId", "deletedAt");

-- CreateIndex
CREATE INDEX "salarie_deletedAt_idx" ON "salarie"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "salarie_entrepriseId_nissHash_key" ON "salarie"("entrepriseId", "nissHash");

-- CreateIndex
CREATE INDEX "condition_travail_cabinetId_idx" ON "condition_travail"("cabinetId");

-- CreateIndex
CREATE UNIQUE INDEX "condition_travail_salarieId_dateEffet_key" ON "condition_travail"("salarieId", "dateEffet");

-- AddForeignKey
ALTER TABLE "salarie" ADD CONSTRAINT "salarie_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salarie" ADD CONSTRAINT "salarie_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "entreprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salarie" ADD CONSTRAINT "salarie_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_travail" ADD CONSTRAINT "condition_travail_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_travail" ADD CONSTRAINT "condition_travail_salarieId_fkey" FOREIGN KEY ("salarieId") REFERENCES "salarie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_travail" ADD CONSTRAINT "condition_travail_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
