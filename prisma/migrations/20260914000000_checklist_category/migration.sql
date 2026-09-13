-- CreateEnum
CREATE TYPE "ChecklistCategory" AS ENUM ('MARKETING', 'SALES', 'HR', 'MANAGEMENT');

-- AlterTable
ALTER TABLE "ChecklistTask" ADD COLUMN "category" "ChecklistCategory" NOT NULL DEFAULT 'MANAGEMENT';

-- One-time backfill of the categories for the tasks seeded before this
-- column existed (everything else stays at the MANAGEMENT default, matching
-- what this checklist has been so far — mostly financial/admin reconciling).
UPDATE "ChecklistTask" SET "category" = 'MARKETING' WHERE "task" IN (
  'Start using the Marketing & Leads Tracker for every new lead going forward',
  'Send Team Updates tab to Marketing Director',
  'Log any new lead/client in the Marketing & Leads Tracker (source, type, value)',
  'Check in on Marketing spend vs. leads generated so far'
);

UPDATE "ChecklistTask" SET "category" = 'SALES' WHERE "task" IN (
  'Review progress toward the $39,000/month revenue goal on Goals & Decisions'
);
