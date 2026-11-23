-- CreateEnum
CREATE TYPE "RevenueCoverage" AS ENUM ('FULL_MONTH', 'MONTH_TO_DATE');

-- CreateEnum
CREATE TYPE "RevenueSnapshotStatus" AS ENUM ('PROVISIONAL', 'RECONCILED');

-- CreateTable
CREATE TABLE "SalesRevenueSnapshot" (
    "monthKey" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "coverage" "RevenueCoverage" NOT NULL,
    "coverageThrough" TIMESTAMP(3) NOT NULL,
    "sourceAsOf" TIMESTAMP(3) NOT NULL,
    "status" "RevenueSnapshotStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesRevenueSnapshot_pkey" PRIMARY KEY ("monthKey")
);

-- AddForeignKey
ALTER TABLE "SalesRevenueSnapshot" ADD CONSTRAINT "SalesRevenueSnapshot_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
