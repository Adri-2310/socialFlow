-- D96 : les heures hebdomadaires passent de Float (heures) à Int (minutes entières).
-- Renommage puis conversion explicite : heures x 60, arrondi à la minute la plus proche
-- (ROUND sur numeric arrondit la moitié vers le haut). Un « supprimer puis ajouter » généré par
-- Prisma perdrait les valeurs existantes.
ALTER TABLE "condition_travail" RENAME COLUMN "heuresSemaine" TO "heuresSemaineMinutes";
ALTER TABLE "condition_travail" RENAME COLUMN "heuresReference" TO "heuresReferenceMinutes";

ALTER TABLE "condition_travail"
  ALTER COLUMN "heuresSemaineMinutes"
    TYPE INTEGER USING ROUND("heuresSemaineMinutes"::numeric * 60)::integer,
  ALTER COLUMN "heuresReferenceMinutes"
    TYPE INTEGER USING ROUND("heuresReferenceMinutes"::numeric * 60)::integer;
