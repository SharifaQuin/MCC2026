-- CreateEnum
CREATE TYPE "ComplianceDocType" AS ENUM ('DRIVERS_LICENSE', 'AUTO_INSURANCE', 'TB_TEST', 'BACKGROUND_CHECK', 'OTHER');

-- CreateTable
CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "docType" "ComplianceDocType" NOT NULL,
    "label" TEXT,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "fileDataUrl" TEXT,
    "fileName" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceDocument_employeeId_idx" ON "ComplianceDocument"("employeeId");

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
