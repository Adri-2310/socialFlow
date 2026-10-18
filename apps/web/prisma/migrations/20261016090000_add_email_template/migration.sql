-- D30, D68 : modeles d'emails personnalises par cabinet.
CREATE TABLE "email_template" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "email_template_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_template_cabinetId_type_key" ON "email_template"("cabinetId", "type");

ALTER TABLE "email_template" ADD CONSTRAINT "email_template_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "cabinet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
