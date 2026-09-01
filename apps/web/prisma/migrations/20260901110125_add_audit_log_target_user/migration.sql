-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "targetUserId" TEXT;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
