-- AlterEnum
-- Postgres can't add an enum value and use it in the same transaction, but
-- that's fine here: nothing in this migration (or any migration) ever sets
-- a report to CONFIRMED — only a reporter's own feedback action does, at
-- runtime, long after this migration has committed.
ALTER TYPE "ProblemReportStatus" ADD VALUE 'CONFIRMED';

-- CreateEnum
CREATE TYPE "ProblemReportEmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ProblemReportFeedbackOutcome" AS ENUM ('CONFIRMED_WORKING', 'STILL_BROKEN');

-- AlterTable
-- Nullable, no default beyond NULL — every existing report (OPEN or
-- RESOLVED) simply has no "latest resolution" on file. Never backfilled:
-- an old RESOLVED report with no resolution row is handled as "no note on
-- file" in the app, not fabricated here.
ALTER TABLE "ProblemReport" ADD COLUMN     "latestResolutionId" TEXT;

-- CreateTable
CREATE TABLE "ProblemReportResolution" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "resolvedById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailStatus" "ProblemReportEmailStatus" NOT NULL DEFAULT 'PENDING',
    "emailError" TEXT,
    "emailSentAt" TIMESTAMP(3),

    CONSTRAINT "ProblemReportResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemReportFeedback" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "resolutionId" TEXT,
    "outcome" "ProblemReportFeedbackOutcome" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemReportFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProblemReportResolution_reportId_resolvedAt_idx" ON "ProblemReportResolution"("reportId", "resolvedAt");

-- CreateIndex
CREATE INDEX "ProblemReportFeedback_reportId_createdAt_idx" ON "ProblemReportFeedback"("reportId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProblemReportResolution" ADD CONSTRAINT "ProblemReportResolution_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ProblemReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReportResolution" ADD CONSTRAINT "ProblemReportResolution_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReportFeedback" ADD CONSTRAINT "ProblemReportFeedback_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ProblemReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReportFeedback" ADD CONSTRAINT "ProblemReportFeedback_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "ProblemReportResolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
