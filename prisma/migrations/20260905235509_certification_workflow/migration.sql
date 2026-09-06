-- CreateEnum
CREATE TYPE "CertificationStatus" AS ENUM ('NOT_RECOMMENDED', 'PENDING', 'CERTIFIED', 'DECLINED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "certDecidedAt" TIMESTAMP(3),
ADD COLUMN     "certDecidedById" TEXT,
ADD COLUMN     "certNotes" TEXT,
ADD COLUMN     "certRecommendedAt" TIMESTAMP(3),
ADD COLUMN     "certRecommendedById" TEXT,
ADD COLUMN     "certificationStatus" "CertificationStatus" NOT NULL DEFAULT 'NOT_RECOMMENDED';

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_certRecommendedById_fkey" FOREIGN KEY ("certRecommendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_certDecidedById_fkey" FOREIGN KEY ("certDecidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
