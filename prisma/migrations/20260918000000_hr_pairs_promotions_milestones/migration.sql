-- AlterEnum
ALTER TYPE "AttendanceEventKind" ADD VALUE 'SENT_HOME';

-- CreateEnum
CREATE TYPE "PromotionTargetRole" AS ENUM ('ASSISTANT', 'LEAD', 'TRAINER');

-- CreateEnum
CREATE TYPE "PromotionDecision" AS ENUM ('PROMOTE', 'DEVELOP', 'STAY', 'ADDRESS');

-- CreateEnum
CREATE TYPE "MilestoneCheckpoint" AS ENUM ('DAY_30', 'DAY_60', 'DAY_90');

-- CreateTable
CREATE TABLE "Pair" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pair_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pair_leadId_idx" ON "Pair"("leadId");

-- CreateIndex
CREATE INDEX "Pair_assistantId_idx" ON "Pair"("assistantId");

-- CreateIndex
-- Enforces "exactly one active partner at a time": a Lead can only appear in
-- one active pair, and an Assistant can only appear in one active pair.
CREATE UNIQUE INDEX "Pair_leadId_active_key" ON "Pair"("leadId") WHERE "active" = true;
CREATE UNIQUE INDEX "Pair_assistantId_active_key" ON "Pair"("assistantId") WHERE "active" = true;

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PromotionAssessment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "targetRole" "PromotionTargetRole" NOT NULL,
    "readinessIndicators" JSONB NOT NULL,
    "decision" "PromotionDecision" NOT NULL,
    "developmentPlan" TEXT,
    "reassessmentDate" TIMESTAMP(3),
    "payDifferential" DOUBLE PRECISION,
    "assessedById" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionAssessment_pkey" PRIMARY KEY ("id"),
    -- Hard rule: a "Develop" decision always carries a real development plan
    -- and a reassessment date, never a vague "revisit later".
    CONSTRAINT "PromotionAssessment_develop_requires_plan_check" CHECK (
        "decision" != 'DEVELOP' OR ("developmentPlan" IS NOT NULL AND "reassessmentDate" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "PromotionAssessment_employeeId_idx" ON "PromotionAssessment"("employeeId");

-- AddForeignKey
ALTER TABLE "PromotionAssessment" ADD CONSTRAINT "PromotionAssessment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionAssessment" ADD CONSTRAINT "PromotionAssessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "MilestoneReview" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "checkpoint" "MilestoneCheckpoint" NOT NULL,
    "completedAt" TIMESTAMP(3),
    "score" INTEGER,
    "notes" TEXT,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MilestoneReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneReview_employeeId_checkpoint_key" ON "MilestoneReview"("employeeId", "checkpoint");

-- AddForeignKey
ALTER TABLE "MilestoneReview" ADD CONSTRAINT "MilestoneReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneReview" ADD CONSTRAINT "MilestoneReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
