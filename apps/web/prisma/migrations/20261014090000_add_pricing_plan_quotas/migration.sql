-- D15 / D34 : quotas des plans (null = illimite). maxStorageMb en Mo.
ALTER TABLE "pricing_plan" ADD COLUMN "maxEntreprises" INTEGER;
ALTER TABLE "pricing_plan" ADD COLUMN "maxUtilisateurs" INTEGER;
ALTER TABLE "pricing_plan" ADD COLUMN "maxStorageMb" INTEGER;

-- Valeurs du cahier des charges client (DECISIONS.md D34) pour les plans
-- existants. Les autres plans restent a null (illimite) tant que le SuperAdmin
-- ne les renseigne pas.
UPDATE "pricing_plan" SET "maxEntreprises" = 25, "maxUtilisateurs" = 3, "maxStorageMb" = 5120
WHERE "planId" = 'starter';
UPDATE "pricing_plan" SET "maxEntreprises" = 100, "maxUtilisateurs" = 10, "maxStorageMb" = 25600
WHERE "planId" = 'pro';
UPDATE "pricing_plan" SET "maxStorageMb" = 102400
WHERE "planId" = 'enterprise';
