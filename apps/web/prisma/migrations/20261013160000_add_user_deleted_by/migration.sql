-- D52 : auteur de l'archivage d'un utilisateur (CABINET_RH | SUPER_ADMIN ; null = auto-suppression).
ALTER TABLE "user" ADD COLUMN "deletedBy" TEXT;
