-- CreateEnum
CREATE TYPE "RookieAssignmentSlot" AS ENUM ('ROOKIE_DAY', 'KNOWLEDGE_LIBRARY');

-- CreateEnum
CREATE TYPE "KnowledgeCheckType" AS ENUM ('QUICK', 'CRITICAL', 'FIELD_SKILL');

-- CreateEnum
CREATE TYPE "FieldSkillRating" AS ENUM ('INTRODUCED', 'PRACTICING', 'DEMONSTRATED', 'NEEDS_COACHING', 'MEETS_STANDARD', 'CONSISTENT');

-- CreateEnum
CREATE TYPE "RookieDay3Decision" AS ENUM ('READY_FOR_ROOKIE_SCHEDULE', 'READY_WITH_COACHING', 'ADDITIONAL_TRAINER_TIME_REQUIRED');

-- CreateEnum
CREATE TYPE "RookieDay10Decision" AS ENUM ('ROOKIE_TRAINING_COMPLETE', 'EXTEND_TRAINING', 'MANAGEMENT_REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "SealDecision" AS ENUM ('MCC_SEAL_APPROVED', 'DEVELOPMENT_EXTENDED', 'MANAGEMENT_REVIEW_REQUIRED');

-- AlterTable
ALTER TABLE "Module" ADD COLUMN     "knowledgeCheckType" "KnowledgeCheckType";

-- CreateTable
CREATE TABLE "RookieDay" (
    "id" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleEs" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionEs" TEXT NOT NULL,
    "estimatedAcademyMinutes" INTEGER NOT NULL DEFAULT 0,
    "fieldGoalEn" TEXT,
    "fieldGoalEs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RookieDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RookieLessonAssignment" (
    "id" TEXT NOT NULL,
    "rookieDayId" TEXT,
    "lessonId" TEXT NOT NULL,
    "slot" "RookieAssignmentSlot" NOT NULL DEFAULT 'ROOKIE_DAY',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RookieLessonAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldSkill" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelEs" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RookieDayFieldSkill" (
    "id" TEXT NOT NULL,
    "rookieDayId" TEXT NOT NULL,
    "fieldSkillId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RookieDayFieldSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RookieFieldCheckoff" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "rookieDayNumber" INTEGER NOT NULL,
    "checkoffDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wentWellNotes" TEXT,
    "needsCoachingNotes" TEXT,
    "tomorrowFocusNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RookieFieldCheckoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RookieFieldSkillRating" (
    "id" TEXT NOT NULL,
    "checkoffId" TEXT NOT NULL,
    "fieldSkillId" TEXT NOT NULL,
    "rating" "FieldSkillRating" NOT NULL,
    "note" TEXT,

    CONSTRAINT "RookieFieldSkillRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RookieDay3Readiness" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "decision" "RookieDay3Decision" NOT NULL,
    "notes" TEXT,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RookieDay3Readiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RookieDay10Review" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "decision" "RookieDay10Decision" NOT NULL,
    "extensionReason" TEXT,
    "skillsNeedingDevelopment" TEXT,
    "newReviewDate" TIMESTAMP(3),
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RookieDay10Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SealOfApprovalEvaluation" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "categoryScores" JSONB NOT NULL,
    "decision" "SealDecision" NOT NULL,
    "notes" TEXT,
    "evaluatedById" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SealOfApprovalEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RookieDay_dayNumber_key" ON "RookieDay"("dayNumber");

-- CreateIndex
CREATE INDEX "RookieDay_dayNumber_idx" ON "RookieDay"("dayNumber");

-- CreateIndex
CREATE INDEX "RookieLessonAssignment_rookieDayId_idx" ON "RookieLessonAssignment"("rookieDayId");

-- CreateIndex
CREATE UNIQUE INDEX "RookieLessonAssignment_lessonId_key" ON "RookieLessonAssignment"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldSkill_key_key" ON "FieldSkill"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RookieDayFieldSkill_rookieDayId_fieldSkillId_key" ON "RookieDayFieldSkill"("rookieDayId", "fieldSkillId");

-- CreateIndex
CREATE INDEX "RookieFieldCheckoff_traineeId_rookieDayNumber_idx" ON "RookieFieldCheckoff"("traineeId", "rookieDayNumber");

-- CreateIndex
CREATE INDEX "RookieFieldCheckoff_trainerId_idx" ON "RookieFieldCheckoff"("trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "RookieFieldSkillRating_checkoffId_fieldSkillId_key" ON "RookieFieldSkillRating"("checkoffId", "fieldSkillId");

-- CreateIndex
CREATE UNIQUE INDEX "RookieDay3Readiness_traineeId_key" ON "RookieDay3Readiness"("traineeId");

-- CreateIndex
CREATE UNIQUE INDEX "RookieDay10Review_traineeId_key" ON "RookieDay10Review"("traineeId");

-- CreateIndex
CREATE INDEX "SealOfApprovalEvaluation_traineeId_idx" ON "SealOfApprovalEvaluation"("traineeId");

-- AddForeignKey
ALTER TABLE "RookieLessonAssignment" ADD CONSTRAINT "RookieLessonAssignment_rookieDayId_fkey" FOREIGN KEY ("rookieDayId") REFERENCES "RookieDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieLessonAssignment" ADD CONSTRAINT "RookieLessonAssignment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieDayFieldSkill" ADD CONSTRAINT "RookieDayFieldSkill_rookieDayId_fkey" FOREIGN KEY ("rookieDayId") REFERENCES "RookieDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieDayFieldSkill" ADD CONSTRAINT "RookieDayFieldSkill_fieldSkillId_fkey" FOREIGN KEY ("fieldSkillId") REFERENCES "FieldSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieFieldCheckoff" ADD CONSTRAINT "RookieFieldCheckoff_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieFieldCheckoff" ADD CONSTRAINT "RookieFieldCheckoff_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieFieldSkillRating" ADD CONSTRAINT "RookieFieldSkillRating_checkoffId_fkey" FOREIGN KEY ("checkoffId") REFERENCES "RookieFieldCheckoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieFieldSkillRating" ADD CONSTRAINT "RookieFieldSkillRating_fieldSkillId_fkey" FOREIGN KEY ("fieldSkillId") REFERENCES "FieldSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieDay3Readiness" ADD CONSTRAINT "RookieDay3Readiness_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieDay3Readiness" ADD CONSTRAINT "RookieDay3Readiness_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieDay10Review" ADD CONSTRAINT "RookieDay10Review_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieDay10Review" ADD CONSTRAINT "RookieDay10Review_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealOfApprovalEvaluation" ADD CONSTRAINT "SealOfApprovalEvaluation_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealOfApprovalEvaluation" ADD CONSTRAINT "SealOfApprovalEvaluation_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

