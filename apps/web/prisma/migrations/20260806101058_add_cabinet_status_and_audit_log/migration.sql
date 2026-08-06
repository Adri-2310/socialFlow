-- AlterTable
ALTER TABLE "cabinet" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'actif';

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "cabinetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: la valeur historique "admin" precede la nomenclature RBAC
-- (SUPER_ADMIN/CABINET_RH/GESTIONNAIRE_RH/ENTREPRISE_CLIENTE/COLLABORATEUR,
-- voir migration add_rbac_base) et empecherait le seul SuperAdmin existant
-- d'acceder au dashboard /admin protege par requireSession({ role: 'SUPER_ADMIN' }).
UPDATE "user" SET "role" = 'SUPER_ADMIN' WHERE "role" = 'admin';
