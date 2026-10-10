-- CreateEnum
CREATE TYPE "PermissionArea" AS ENUM ('HR_SUMMARY', 'RECRUITING', 'ONBOARDING', 'TRAINING', 'STAFF_DIRECTORY', 'SALES_LEADS', 'CALLBACK_QUEUE', 'OPERATIONAL_STATUS', 'ASSIGNED_TASKS');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('REJECT_APPLICANT', 'OFFER_APPLICANT', 'SEND_MESSAGE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'NEEDS_RESUBMISSION');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'OFFICE_ASSISTANT';

-- AlterTable
ALTER TABLE "ChecklistTask" ADD COLUMN     "assigneeId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "languageNote" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvalManagerId" TEXT;

-- CreateTable
CREATE TABLE "AreaAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "area" "PermissionArea" NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AreaAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT,
    "changedFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "actionType" "ApprovalActionType" NOT NULL,
    "rationale" TEXT NOT NULL,
    "proposedOutcome" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "messageText" TEXT,
    "applicantStageAtRequest" "ApplicantStage" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "executedById" TEXT,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AreaAccess_userId_area_key" ON "AreaAccess"("userId", "area");

-- CreateIndex
CREATE INDEX "AuditLogEntry_recordType_recordId_idx" ON "AuditLogEntry"("recordType", "recordId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_actorId_createdAt_idx" ON "AuditLogEntry"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_managerId_status_idx" ON "ApprovalRequest"("managerId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_requesterId_status_idx" ON "ApprovalRequest"("requesterId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_applicantId_idx" ON "ApprovalRequest"("applicantId");

-- Prevent two PENDING requests for the same applicant+action at once —
-- Prisma's schema syntax can't express a partial unique index, so it's
-- added by hand here. "Pending" is deliberately not part of the indexed
-- columns (Postgres partial indexes filter in the WHERE clause, not the
-- column list), so the constraint only ever applies among PENDING rows.
CREATE UNIQUE INDEX "ApprovalRequest_one_pending_per_applicant_action" ON "ApprovalRequest"("applicantId", "actionType") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "AreaAccess" ADD CONSTRAINT "AreaAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_approvalManagerId_fkey" FOREIGN KEY ("approvalManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTask" ADD CONSTRAINT "ChecklistTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
