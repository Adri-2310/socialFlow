-- C2 / D55 : le plan appartient au cabinet, pas a une personne.
ALTER TABLE "cabinet" ADD COLUMN "planId" TEXT;
ALTER TABLE "cabinet" ADD COLUMN "billingPeriod" TEXT;
ALTER TABLE "cabinet" ADD COLUMN "billingStatus" TEXT NOT NULL DEFAULT 'EN_ATTENTE_PAIEMENT';
ALTER TABLE "cabinet" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "cabinet" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);

-- Reprise de l'existant : plan et periode du titulaire (Cabinet RH, le plus
-- ancien) vers son cabinet.
UPDATE "cabinet" c
SET "planId" = u."plan",
    "billingPeriod" = u."billingPeriod"
FROM (
  SELECT DISTINCT ON ("cabinetId") "cabinetId", "plan", "billingPeriod"
  FROM "user"
  WHERE "role" = 'CABINET_RH' AND "cabinetId" IS NOT NULL AND "deletedAt" IS NULL
  ORDER BY "cabinetId", "createdAt" ASC
) u
WHERE c."id" = u."cabinetId";

-- Un cabinet deja relie a Stripe a recu un essai de 30 jours a sa creation
-- (voir lib/stripe-trial.ts) : on le reprend comme tel.
UPDATE "cabinet"
SET "billingStatus" = 'ESSAI',
    "trialEndsAt" = "createdAt" + INTERVAL '30 days',
    "currentPeriodEnd" = "createdAt" + INTERVAL '30 days'
WHERE "stripeCustomerId" IS NOT NULL;
