-- AlterTable
ALTER TABLE "PayrollEntry" ADD COLUMN     "overriddenById" TEXT,
ADD COLUMN     "overrideNote" TEXT,
ADD COLUMN     "signedViaOverride" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
