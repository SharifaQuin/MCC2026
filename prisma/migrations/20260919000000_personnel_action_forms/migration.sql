-- CreateEnum
CREATE TYPE "PafActionType" AS ENUM ('PROMOTION', 'PAY_CHANGE', 'TRANSFER', 'TITLE_CHANGE', 'TERMINATION', 'OTHER');

-- CreateEnum
CREATE TYPE "PafStatus" AS ENUM ('DRAFT', 'APPROVED', 'EXECUTED');

-- CreateTable
CREATE TABLE "PersonnelActionForm" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "actionType" "PafActionType" NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "priorTitle" TEXT,
    "newTitle" TEXT,
    "priorPay" DOUBLE PRECISION,
    "newPay" DOUBLE PRECISION,
    "priorDepartment" TEXT,
    "newDepartment" TEXT,
    "reason" TEXT,
    "linkedAssessmentId" TEXT,
    "status" "PafStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonnelActionForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonnelActionForm_linkedAssessmentId_key" ON "PersonnelActionForm"("linkedAssessmentId");

-- CreateIndex
CREATE INDEX "PersonnelActionForm_employeeId_idx" ON "PersonnelActionForm"("employeeId");

-- AddForeignKey
ALTER TABLE "PersonnelActionForm" ADD CONSTRAINT "PersonnelActionForm_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonnelActionForm" ADD CONSTRAINT "PersonnelActionForm_linkedAssessmentId_fkey" FOREIGN KEY ("linkedAssessmentId") REFERENCES "PromotionAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonnelActionForm" ADD CONSTRAINT "PersonnelActionForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonnelActionForm" ADD CONSTRAINT "PersonnelActionForm_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
