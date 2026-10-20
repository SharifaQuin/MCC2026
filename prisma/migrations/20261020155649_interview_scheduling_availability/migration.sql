-- CreateEnum
CREATE TYPE "InterviewFormat" AS ENUM ('ZOOM', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "AvailabilityExceptionType" AS ENUM ('UNAVAILABLE', 'EXTRA_HOURS');

-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN     "interviewFormat" "InterviewFormat",
ADD COLUMN     "interviewerId" TEXT;

-- AlterTable
ALTER TABLE "InterviewAvailabilitySlot" ADD COLUMN     "calendarEventId" TEXT,
ADD COLUMN     "format" "InterviewFormat",
ADD COLUMN     "interviewerId" TEXT;

-- CreateTable
CREATE TABLE "InterviewerAvailability" (
    "id" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "durationMins" INTEGER NOT NULL DEFAULT 30,
    "bufferBeforeMins" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMins" INTEGER NOT NULL DEFAULT 0,
    "supportsZoom" BOOLEAN NOT NULL DEFAULT true,
    "supportsInPerson" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewerAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityWeeklyHour" (
    "id" TEXT NOT NULL,
    "availabilityId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityWeeklyHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityDateException" (
    "id" TEXT NOT NULL,
    "availabilityId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "AvailabilityExceptionType" NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityDateException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewerAvailability_interviewerId_key" ON "InterviewerAvailability"("interviewerId");

-- CreateIndex
CREATE INDEX "AvailabilityWeeklyHour_availabilityId_dayOfWeek_idx" ON "AvailabilityWeeklyHour"("availabilityId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "AvailabilityDateException_availabilityId_date_idx" ON "AvailabilityDateException"("availabilityId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityDateException_availabilityId_date_startMinute_key" ON "AvailabilityDateException"("availabilityId", "date", "startMinute");

-- CreateIndex
CREATE INDEX "InterviewAvailabilitySlot_interviewerId_startsAt_idx" ON "InterviewAvailabilitySlot"("interviewerId", "startsAt");

-- CreateIndex
CREATE INDEX "InterviewAvailabilitySlot_format_startsAt_idx" ON "InterviewAvailabilitySlot"("format", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewAvailabilitySlot_interviewerId_startsAt_key" ON "InterviewAvailabilitySlot"("interviewerId", "startsAt");

-- AddForeignKey
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAvailabilitySlot" ADD CONSTRAINT "InterviewAvailabilitySlot_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewerAvailability" ADD CONSTRAINT "InterviewerAvailability_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityWeeklyHour" ADD CONSTRAINT "AvailabilityWeeklyHour_availabilityId_fkey" FOREIGN KEY ("availabilityId") REFERENCES "InterviewerAvailability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityDateException" ADD CONSTRAINT "AvailabilityDateException_availabilityId_fkey" FOREIGN KEY ("availabilityId") REFERENCES "InterviewerAvailability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

