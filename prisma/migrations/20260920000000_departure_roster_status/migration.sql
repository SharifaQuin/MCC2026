-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastDay" TIMESTAMP(3),
ADD COLUMN     "departureReason" TEXT,
ADD COLUMN     "departureRecordedById" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departureRecordedById_fkey" FOREIGN KEY ("departureRecordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
