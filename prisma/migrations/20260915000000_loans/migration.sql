-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "lender" TEXT NOT NULL,
    "loanType" TEXT,
    "status" "LoanStatus" NOT NULL DEFAULT 'OPEN',
    "originationDate" TIMESTAMP(3),
    "closedDate" TIMESTAMP(3),
    "loanAmount" DOUBLE PRECISION,
    "feeAmount" DOUBLE PRECISION,
    "totalToRepay" DOUBLE PRECISION,
    "repaymentRatePct" DOUBLE PRECISION,
    "minimumPayment" DOUBLE PRECISION,
    "minimumPaymentFrequency" TEXT,
    "repaymentStartDate" TIMESTAMP(3),
    "maturityDate" TIMESTAMP(3),
    "priorLoanBalance" DOUBLE PRECISION,
    "netProceeds" DOUBLE PRECISION,
    "currentBalance" DOUBLE PRECISION,
    "currentBalanceAsOf" TIMESTAMP(3),
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanRepayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "interestFeePaid" DOUBLE PRECISION,
    "principalPaid" DOUBLE PRECISION,
    "totalPaid" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoanRepayment_loanId_month_key" ON "LoanRepayment"("loanId", "month");

-- AddForeignKey
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Superseded by the Loan table above — the real loan data is seeded via
-- prisma/seed.ts (seedLoans), matching how every other owner-dashboard table
-- is populated, rather than hardcoded here.
DELETE FROM "OwnerSetting" WHERE "key" = 'loans_open';
