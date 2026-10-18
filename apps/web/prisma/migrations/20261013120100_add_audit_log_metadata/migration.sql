-- Contexte d'une action auditee (ex. invitation concernee), voir
-- doc/FONCTIONNEMENT.md § 9.
ALTER TABLE "audit_log" ADD COLUMN "metadata" JSONB;
