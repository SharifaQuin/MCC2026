-- AlterTable
ALTER TABLE "User" ADD COLUMN     "payrollAliasNames" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "PayrollUnmatchedReport" (
    "id" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "reportData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollUnmatchedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollUnmatchedReport_payPeriodId_idx" ON "PayrollUnmatchedReport"("payPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollUnmatchedReport_payPeriodId_rawName_key" ON "PayrollUnmatchedReport"("payPeriodId", "rawName");

-- AddForeignKey
ALTER TABLE "PayrollUnmatchedReport" ADD CONSTRAINT "PayrollUnmatchedReport_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "PayPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
