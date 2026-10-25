-- AlterEnum
-- Postgres can't add an enum value and use it in the same transaction, but
-- that's fine here: nothing in this migration ever creates an
-- ApprovalRequest row using either new value — only a later, separate
-- runtime action (submitApprovalRequestAction) does that.
ALTER TYPE "ApprovalActionType" ADD VALUE 'SCHEDULE_IN_PERSON_INTERVIEW';
ALTER TYPE "ApprovalActionType" ADD VALUE 'SCHEDULE_WORKING_SESSION';

-- CreateEnum
CREATE TYPE "ApprovalExecutionStatus" AS ENUM ('IN_PROGRESS', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- AlterTable
-- All nullable, no backfill — every existing ApprovalRequest row (the
-- three pre-existing action types) simply has none of these set, exactly
-- as before this migration.
ALTER TABLE "ApprovalRequest" ADD COLUMN     "proposedScheduledAt" TIMESTAMP(3);
ALTER TABLE "ApprovalRequest" ADD COLUMN     "decidedScheduledAt" TIMESTAMP(3);
ALTER TABLE "ApprovalRequest" ADD COLUMN     "executionStatus" "ApprovalExecutionStatus";
ALTER TABLE "ApprovalRequest" ADD COLUMN     "executionError" TEXT;
