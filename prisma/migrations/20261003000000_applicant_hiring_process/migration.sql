-- CreateEnum
CREATE TYPE "JobPostingRoleTrack" AS ENUM ('LEAD_TECHNICIAN', 'ASSISTANT_TECHNICIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "PhoneScreenOutcome" AS ENUM ('PROCEED', 'HOLD', 'DECLINE');

-- CreateEnum
CREATE TYPE "InterviewQuestionRole" AS ENUM ('ALL', 'LEAD_ONLY', 'ASSISTANT_ONLY');

-- CreateEnum
CREATE TYPE "InterviewRecommendation" AS ENUM ('STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE');

-- CreateEnum
CREATE TYPE "ReferenceVerdict" AS ENUM ('STRONG_POSITIVE', 'GENERALLY_POSITIVE', 'MIXED', 'NEGATIVE');

-- AlterTable
ALTER TABLE "JobPosting" ADD COLUMN "roleTrack" "JobPostingRoleTrack" NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "ApplicantNote" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicantNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneScreenQuestion" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "textEn" TEXT NOT NULL,
    "textEs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneScreenQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneScreenAnswer" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "responseText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneScreenAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneScreenResult" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "criteriaChecklist" JSONB,
    "languageNote" TEXT,
    "outcome" "PhoneScreenOutcome",
    "redFlagsNotes" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneScreenResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "competency" TEXT NOT NULL,
    "textEn" TEXT NOT NULL,
    "textEs" TEXT,
    "whatToListenFor" TEXT,
    "roleScope" "InterviewQuestionRole" NOT NULL DEFAULT 'ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestionAnswer" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "responseText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewQuestionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewScorecard" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "evaluatorId" TEXT,
    "recommendation" "InterviewRecommendation",
    "rationale" TEXT,
    "concerns" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewScorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewCompetencyScore" (
    "id" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "competency" TEXT NOT NULL,
    "score" INTEGER,
    "evidence" TEXT,

    CONSTRAINT "InterviewCompetencyScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingSessionRecord" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "housesToVisit" TEXT,
    "preSessionChecklist" JSONB,
    "leadEvaluatorId" TEXT,
    "technicalScore" INTEGER,
    "technicalNotes" TEXT,
    "paceStaminaScore" INTEGER,
    "paceStaminaNotes" TEXT,
    "attentionDetailScore" INTEGER,
    "attentionDetailNotes" TEXT,
    "clientHomeScore" INTEGER,
    "clientHomeNotes" TEXT,
    "coachabilityScore" INTEGER,
    "coachabilityNotes" TEXT,
    "pairDynamicScore" INTEGER,
    "pairDynamicNotes" TEXT,
    "safetyScore" INTEGER,
    "safetyNotes" TEXT,
    "honestAssessment" TEXT,
    "concernsRaised" TEXT,
    "recommendation" "InterviewRecommendation",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkingSessionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceCheck" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "referenceName" TEXT,
    "referenceRelationship" TEXT,
    "durationKnown" TEXT,
    "referencePhone" TEXT,
    "calledAt" TIMESTAMP(3),
    "capacityDuration" TEXT,
    "responsibilities" TEXT,
    "strengths" TEXT,
    "growthAreas" TEXT,
    "customerFacing" TEXT,
    "handledFeedback" TEXT,
    "wouldRehire" TEXT,
    "anythingElse" TEXT,
    "verdict" "ReferenceVerdict",
    "redFlagsSurfaced" TEXT,
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicantNote_applicantId_createdAt_idx" ON "ApplicantNote"("applicantId", "createdAt");

-- CreateIndex
CREATE INDEX "PhoneScreenQuestion_jobPostingId_order_idx" ON "PhoneScreenQuestion"("jobPostingId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneScreenAnswer_applicantId_questionId_key" ON "PhoneScreenAnswer"("applicantId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneScreenResult_applicantId_key" ON "PhoneScreenResult"("applicantId");

-- CreateIndex
CREATE INDEX "InterviewQuestion_jobPostingId_order_idx" ON "InterviewQuestion"("jobPostingId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewQuestionAnswer_applicantId_questionId_key" ON "InterviewQuestionAnswer"("applicantId", "questionId");

-- CreateIndex
CREATE INDEX "InterviewScorecard_applicantId_createdAt_idx" ON "InterviewScorecard"("applicantId", "createdAt");

-- CreateIndex
CREATE INDEX "InterviewCompetencyScore_scorecardId_idx" ON "InterviewCompetencyScore"("scorecardId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkingSessionRecord_applicantId_key" ON "WorkingSessionRecord"("applicantId");

-- CreateIndex
CREATE INDEX "ReferenceCheck_applicantId_idx" ON "ReferenceCheck"("applicantId");

-- AddForeignKey
ALTER TABLE "ApplicantNote" ADD CONSTRAINT "ApplicantNote_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicantNote" ADD CONSTRAINT "ApplicantNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneScreenQuestion" ADD CONSTRAINT "PhoneScreenQuestion_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneScreenAnswer" ADD CONSTRAINT "PhoneScreenAnswer_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhoneScreenAnswer" ADD CONSTRAINT "PhoneScreenAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PhoneScreenQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneScreenResult" ADD CONSTRAINT "PhoneScreenResult_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhoneScreenResult" ADD CONSTRAINT "PhoneScreenResult_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestionAnswer" ADD CONSTRAINT "InterviewQuestionAnswer_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewQuestionAnswer" ADD CONSTRAINT "InterviewQuestionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewScorecard" ADD CONSTRAINT "InterviewScorecard_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewScorecard" ADD CONSTRAINT "InterviewScorecard_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewCompetencyScore" ADD CONSTRAINT "InterviewCompetencyScore_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "InterviewScorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingSessionRecord" ADD CONSTRAINT "WorkingSessionRecord_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkingSessionRecord" ADD CONSTRAINT "WorkingSessionRecord_leadEvaluatorId_fkey" FOREIGN KEY ("leadEvaluatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceCheck" ADD CONSTRAINT "ReferenceCheck_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferenceCheck" ADD CONSTRAINT "ReferenceCheck_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
