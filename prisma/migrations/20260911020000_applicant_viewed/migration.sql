-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN     "viewedAt" TIMESTAMP(3),
ADD COLUMN     "viewedById" TEXT;

-- AddForeignKey
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_viewedById_fkey" FOREIGN KEY ("viewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
