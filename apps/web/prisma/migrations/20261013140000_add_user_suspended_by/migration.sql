-- D52 : auteur de la suspension d'un utilisateur (SUPER_ADMIN | CABINET_RH).
ALTER TABLE "user" ADD COLUMN "suspendedBy" TEXT;
