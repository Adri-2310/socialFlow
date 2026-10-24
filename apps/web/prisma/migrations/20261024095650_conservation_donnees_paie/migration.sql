-- DropForeignKey
ALTER TABLE "condition_travail" DROP CONSTRAINT "condition_travail_cabinetId_fkey";

-- DropForeignKey
ALTER TABLE "condition_travail" DROP CONSTRAINT "condition_travail_salarieId_fkey";

-- DropForeignKey
ALTER TABLE "entreprise" DROP CONSTRAINT "entreprise_cabinetId_fkey";

-- DropForeignKey
ALTER TABLE "periode_paie" DROP CONSTRAINT "periode_paie_cabinetId_fkey";

-- DropForeignKey
ALTER TABLE "periode_paie" DROP CONSTRAINT "periode_paie_entrepriseId_fkey";

-- DropForeignKey
ALTER TABLE "prestation" DROP CONSTRAINT "prestation_cabinetId_fkey";

-- DropForeignKey
ALTER TABLE "prestation" DROP CONSTRAINT "prestation_periodeId_fkey";

-- DropForeignKey
ALTER TABLE "prestation" DROP CONSTRAINT "prestation_salarieId_fkey";

-- DropForeignKey
ALTER TABLE "salarie" DROP CONSTRAINT "salarie_cabinetId_fkey";

-- DropForeignKey
ALTER TABLE "salarie" DROP CONSTRAINT "salarie_entrepriseId_fkey";

-- AlterTable
ALTER TABLE "cabinet" ADD COLUMN     "donneesPurgeesLe" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "entreprise" ADD CONSTRAINT "entreprise_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salarie" ADD CONSTRAINT "salarie_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salarie" ADD CONSTRAINT "salarie_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_travail" ADD CONSTRAINT "condition_travail_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_travail" ADD CONSTRAINT "condition_travail_salarieId_fkey" FOREIGN KEY ("salarieId") REFERENCES "salarie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periode_paie" ADD CONSTRAINT "periode_paie_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periode_paie" ADD CONSTRAINT "periode_paie_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestation" ADD CONSTRAINT "prestation_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestation" ADD CONSTRAINT "prestation_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "periode_paie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestation" ADD CONSTRAINT "prestation_salarieId_fkey" FOREIGN KEY ("salarieId") REFERENCES "salarie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
