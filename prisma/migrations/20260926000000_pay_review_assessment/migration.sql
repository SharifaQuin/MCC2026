-- CreateEnum
CREATE TYPE "PayReviewDecision" AS ENUM ('APPROVED', 'DENIED', 'DEFERRED');

-- CreateTable
CREATE TABLE "PayReviewAssessment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "currentPay" DOUBLE PRECISION NOT NULL,
    "recommendedPay" DOUBLE PRECISION NOT NULL,
    "justification" TEXT NOT NULL,
    "decision" "PayReviewDecision" NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "reviewedById" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayReviewAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayReviewAssessment_employeeId_idx" ON "PayReviewAssessment"("employeeId");

-- AddForeignKey
ALTER TABLE "PayReviewAssessment" ADD CONSTRAINT "PayReviewAssessment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayReviewAssessment" ADD CONSTRAINT "PayReviewAssessment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "PersonnelActionForm" ADD COLUMN "linkedPayReviewId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PersonnelActionForm_linkedPayReviewId_key" ON "PersonnelActionForm"("linkedPayReviewId");

-- AddForeignKey
ALTER TABLE "PersonnelActionForm" ADD CONSTRAINT "PersonnelActionForm_linkedPayReviewId_fkey" FOREIGN KEY ("linkedPayReviewId") REFERENCES "PayReviewAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
