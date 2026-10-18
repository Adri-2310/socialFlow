-- D34 : le PRD client prevoit 3 plans a prix fixe, jamais "sur devis".
ALTER TABLE "pricing_plan" DROP COLUMN "custom";
