-- CreateEnum
CREATE TYPE "SlotBookingStatus" AS ENUM ('HOLD', 'CONFIRMED', 'RELEASED');

-- CreateTable
CREATE TABLE "SlotFeedMonth" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "schema" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "settings" JSONB NOT NULL,
    "windowValuePerHour" JSONB NOT NULL,
    "routeBoard" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT,

    CONSTRAINT "SlotFeedMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotFeedDate" (
    "id" TEXT NOT NULL,
    "feedMonthId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weekday" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "openPersonHours" DOUBLE PRECISION NOT NULL,
    "openDollars" DOUBLE PRECISION NOT NULL,
    "blocks" JSONB NOT NULL,
    "bookedJobs" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "SlotFeedDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotBooking" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "block" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "leadId" TEXT,
    "repId" TEXT NOT NULL,
    "personHours" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION,
    "frequency" TEXT,
    "status" "SlotBookingStatus" NOT NULL DEFAULT 'HOLD',
    "holdExpiresAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "enteredTcsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlotFeedMonth_month_key" ON "SlotFeedMonth"("month");

-- CreateIndex
CREATE INDEX "SlotFeedDate_date_idx" ON "SlotFeedDate"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SlotFeedDate_feedMonthId_date_key" ON "SlotFeedDate"("feedMonthId", "date");

-- CreateIndex
CREATE INDEX "SlotBooking_month_date_block_idx" ON "SlotBooking"("month", "date", "block");

-- CreateIndex
CREATE INDEX "SlotBooking_leadId_idx" ON "SlotBooking"("leadId");

-- AddForeignKey
ALTER TABLE "SlotFeedMonth" ADD CONSTRAINT "SlotFeedMonth_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotFeedDate" ADD CONSTRAINT "SlotFeedDate_feedMonthId_fkey" FOREIGN KEY ("feedMonthId") REFERENCES "SlotFeedMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotBooking" ADD CONSTRAINT "SlotBooking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotBooking" ADD CONSTRAINT "SlotBooking_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

