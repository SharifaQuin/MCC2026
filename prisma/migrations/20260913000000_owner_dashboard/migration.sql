-- CreateEnum
CREATE TYPE "ChecklistFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ONE_TIME', 'MILESTONE');

-- CreateEnum
CREATE TYPE "ChecklistOwner" AS ENUM ('OWNER', 'TEAM');

-- CreateEnum
CREATE TYPE "ChecklistVisibility" AS ENUM ('OWNER_ONLY', 'TEAM');

-- CreateEnum
CREATE TYPE "ChecklistTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "MonthlyFinancials" (
    "month" TEXT NOT NULL,
    "monthLabel" TEXT NOT NULL,
    "revenueTotal" DOUBLE PRECISION NOT NULL,
    "revenueCommercial" DOUBLE PRECISION NOT NULL,
    "revenueResidential" DOUBLE PRECISION NOT NULL,
    "cleanerTipsMemo" DOUBLE PRECISION,
    "technicianPayroll" DOUBLE PRECISION NOT NULL,
    "mileageReimbursements" DOUBLE PRECISION NOT NULL,
    "supplies" DOUBLE PRECISION NOT NULL,
    "cogsTotal" DOUBLE PRECISION NOT NULL,
    "grossProfit" DOUBLE PRECISION NOT NULL,
    "grossMarginPct" DOUBLE PRECISION NOT NULL,
    "adminPayroll" DOUBLE PRECISION NOT NULL,
    "rent" DOUBLE PRECISION NOT NULL,
    "hiringRecruiting" DOUBLE PRECISION NOT NULL,
    "fuel" DOUBLE PRECISION NOT NULL,
    "insurance" DOUBLE PRECISION NOT NULL,
    "vehicle" DOUBLE PRECISION NOT NULL,
    "marketing" DOUBLE PRECISION NOT NULL,
    "fees" DOUBLE PRECISION NOT NULL,
    "misc" DOUBLE PRECISION,
    "creditCard" DOUBLE PRECISION NOT NULL,
    "loanPayoff" DOUBLE PRECISION NOT NULL,
    "stripeCapitalInterest" DOUBLE PRECISION NOT NULL,
    "equipmentFinancing" DOUBLE PRECISION NOT NULL,
    "opexTotal" DOUBLE PRECISION NOT NULL,
    "netProfit" DOUBLE PRECISION NOT NULL,
    "netMarginPct" DOUBLE PRECISION NOT NULL,
    "target21pct" DOUBLE PRECISION NOT NULL,
    "varianceToTarget" DOUBLE PRECISION NOT NULL,
    "ownerDraw" DOUBLE PRECISION NOT NULL,
    "endingBankBalance" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyFinancials_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "OwnerSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "TeamGoal" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamGoal_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ChecklistTask" (
    "id" TEXT NOT NULL,
    "frequency" "ChecklistFrequency" NOT NULL,
    "task" TEXT NOT NULL,
    "owner" "ChecklistOwner" NOT NULL,
    "status" "ChecklistTaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "completedAt" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "notes" TEXT,
    "visibility" "ChecklistVisibility" NOT NULL DEFAULT 'OWNER_ONLY',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "clientName" TEXT NOT NULL,
    "leadSource" TEXT,
    "clientType" TEXT,
    "converted" TEXT,
    "monthlyValue" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
