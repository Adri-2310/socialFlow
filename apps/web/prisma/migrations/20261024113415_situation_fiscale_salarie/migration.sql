-- AlterTable
ALTER TABLE "salarie" ADD COLUMN     "autresCharge" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "autresChargeDependantes66" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "autresChargeHandicapees" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "beneficiaireHandicape" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "chargesFamilleAttribuees" BOOLEAN,
ADD COLUMN     "conjointHandicape" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "conjointRevenus" TEXT,
ADD COLUMN     "enfantsCharge" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "enfantsHandicapes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentIsole" BOOLEAN NOT NULL DEFAULT false;

-- Reprise des dossiers existants (D95). Les anciennes colonnes restent en place jusqu'au moteur de paie.
-- Les personnes à charge saisies jusqu'ici deviennent des enfants à charge.
UPDATE "salarie" SET "enfantsCharge" = "personnesCharge";

-- Un marié dont on savait si le conjoint a des revenus : oui devient REVENUS, non devient
-- SANS_REVENUS. Un marié sans réponse reste vide (le moteur refusera de calculer), un isolé aussi.
UPDATE "salarie"
SET "conjointRevenus" = CASE WHEN "conjointAvecRevenus" THEN 'REVENUS' ELSE 'SANS_REVENUS' END
WHERE "situationFamiliale" = 'MARIE_OU_COHABITANT_LEGAL' AND "conjointAvecRevenus" IS NOT NULL;
