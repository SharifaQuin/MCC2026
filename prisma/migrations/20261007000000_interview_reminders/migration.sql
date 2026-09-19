-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN "interviewConfirmToken" TEXT;
ALTER TABLE "Applicant" ADD COLUMN "interviewConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Applicant" ADD COLUMN "interviewReminderDaySentAt" TIMESTAMP(3);
ALTER TABLE "Applicant" ADD COLUMN "interviewReminderHourSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Applicant_interviewConfirmToken_key" ON "Applicant"("interviewConfirmToken");
