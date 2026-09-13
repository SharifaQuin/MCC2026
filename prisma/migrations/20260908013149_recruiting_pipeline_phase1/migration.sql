-- CreateEnum
CREATE TYPE "ApplicantStage" AS ENUM ('NEW', 'PRESCREEN_FAILED', 'PRESCREEN_PASSED', 'PHONE_INTERVIEW_SCHEDULED', 'PHONE_INTERVIEW_PASSED', 'PHONE_INTERVIEW_FAILED', 'IN_PERSON_SCHEDULED', 'IN_PERSON_PASSED', 'IN_PERSON_FAILED', 'OFFER_SENT', 'HIRED', 'REJECTED', 'BENCH');

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "positionType" TEXT,
    "descriptionEn" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescreenQuestion" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "textEn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescreenQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescreenOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "textEn" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PrescreenOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Applicant" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "resumeDataUrl" TEXT,
    "resumeFileName" TEXT,
    "stage" "ApplicantStage" NOT NULL DEFAULT 'NEW',
    "prescreenScore" INTEGER,
    "prescreenMaxScore" INTEGER,
    "prescreenPassed" BOOLEAN,
    "notes" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "benchedAt" TIMESTAMP(3),
    "hiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Applicant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescreenAnswer" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "PrescreenAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobPosting_slug_key" ON "JobPosting"("slug");

-- CreateIndex
CREATE INDEX "PrescreenQuestion_jobPostingId_order_idx" ON "PrescreenQuestion"("jobPostingId", "order");

-- CreateIndex
CREATE INDEX "PrescreenOption_questionId_order_idx" ON "PrescreenOption"("questionId", "order");

-- CreateIndex
CREATE INDEX "Applicant_jobPostingId_stage_idx" ON "Applicant"("jobPostingId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "PrescreenAnswer_applicantId_questionId_key" ON "PrescreenAnswer"("applicantId", "questionId");

-- AddForeignKey
ALTER TABLE "PrescreenQuestion" ADD CONSTRAINT "PrescreenQuestion_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescreenOption" ADD CONSTRAINT "PrescreenOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PrescreenQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescreenAnswer" ADD CONSTRAINT "PrescreenAnswer_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescreenAnswer" ADD CONSTRAINT "PrescreenAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PrescreenQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescreenAnswer" ADD CONSTRAINT "PrescreenAnswer_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PrescreenOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
