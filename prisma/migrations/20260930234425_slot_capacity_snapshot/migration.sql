-- CreateTable
CREATE TABLE "SlotCapacitySnapshot" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weekday" TEXT NOT NULL,
    "openDollarsAtImport" DOUBLE PRECISION NOT NULL,
    "openPersonHoursAtImport" DOUBLE PRECISION NOT NULL,
    "bookedDollars" DOUBLE PRECISION NOT NULL,
    "bookedPersonHours" DOUBLE PRECISION NOT NULL,
    "lostDollars" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotCapacitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlotCapacitySnapshot_month_idx" ON "SlotCapacitySnapshot"("month");

-- CreateIndex
CREATE UNIQUE INDEX "SlotCapacitySnapshot_month_date_key" ON "SlotCapacitySnapshot"("month", "date");

