-- Recruiting 2.0 — every change here is purely additive (new enum values,
-- new nullable columns with safe defaults, one new table). Nothing existing
-- is renamed, dropped, or backfilled. Existing JobPosting/Applicant/
-- PrescreenQuestion rows are unaffected: resumeRequired defaults to false
-- (matching the current app-wide behavior), and category defaults to
-- REQUIRED (matching how every existing prescreen question already
-- behaves — it counts toward pass/fail, exactly as today).

-- CreateEnum
CREATE TYPE "PrescreenQuestionCategory" AS ENUM ('REQUIRED', 'PREFERRED');

-- AlterEnum
ALTER TYPE "ApplicantSource" ADD VALUE 'META';

-- AlterTable
ALTER TABLE "JobPosting" ADD COLUMN     "resumeRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PrescreenQuestion" ADD COLUMN     "category" "PrescreenQuestionCategory" NOT NULL DEFAULT 'REQUIRED';

-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN     "city" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT,
ADD COLUMN     "utmTerm" TEXT;

-- CreateTable
CREATE TABLE "InterviewAvailabilitySlot" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMins" INTEGER NOT NULL DEFAULT 30,
    "bookedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewAvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewAvailabilitySlot_bookedById_key" ON "InterviewAvailabilitySlot"("bookedById");

-- CreateIndex
CREATE INDEX "InterviewAvailabilitySlot_jobPostingId_startsAt_idx" ON "InterviewAvailabilitySlot"("jobPostingId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewAvailabilitySlot_startsAt_jobPostingId_key" ON "InterviewAvailabilitySlot"("startsAt", "jobPostingId");

-- AddForeignKey
ALTER TABLE "InterviewAvailabilitySlot" ADD CONSTRAINT "InterviewAvailabilitySlot_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAvailabilitySlot" ADD CONSTRAINT "InterviewAvailabilitySlot_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "Applicant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAvailabilitySlot" ADD CONSTRAINT "InterviewAvailabilitySlot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
