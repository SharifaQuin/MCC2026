-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "hiredUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Applicant_hiredUserId_key" ON "Applicant"("hiredUserId");

-- AddForeignKey
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_hiredUserId_fkey" FOREIGN KEY ("hiredUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
