-- AlterTable
ALTER TABLE "PayrollEntry" ADD COLUMN     "adjustmentsPayout" DOUBLE PRECISION,
ADD COLUMN     "avgPayPerHour" DOUBLE PRECISION,
ADD COLUMN     "estimatedHours" DOUBLE PRECISION,
ADD COLUMN     "jobsPayout" DOUBLE PRECISION,
ADD COLUMN     "totalHours" DOUBLE PRECISION,
ADD COLUMN     "totalPayout" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "PayrollJobLine" (
    "id" TEXT NOT NULL,
    "payrollEntryId" TEXT NOT NULL,
    "jobExternalId" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "performedDate" TIMESTAMP(3),
    "clockIn" TEXT NOT NULL,
    "clockOut" TEXT NOT NULL,
    "actualTimeHours" DOUBLE PRECISION NOT NULL,
    "serviceTimeHours" DOUBLE PRECISION NOT NULL,
    "payout" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollJobLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "payrollEntryId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "clockIn" TEXT,
    "clockOut" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollJobLine_payrollEntryId_idx" ON "PayrollJobLine"("payrollEntryId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_payrollEntryId_idx" ON "PayrollAdjustment"("payrollEntryId");

-- AddForeignKey
ALTER TABLE "PayrollJobLine" ADD CONSTRAINT "PayrollJobLine_payrollEntryId_fkey" FOREIGN KEY ("payrollEntryId") REFERENCES "PayrollEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_payrollEntryId_fkey" FOREIGN KEY ("payrollEntryId") REFERENCES "PayrollEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

