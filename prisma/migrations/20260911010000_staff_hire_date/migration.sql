-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hireDate" TIMESTAMP(3);

-- Backfill: default everyone's hire date to their account-creation date.
-- This is very likely wrong for anyone invited before their actual start
-- date, but gives HR a starting point they can correct per person instead
-- of every hire date starting out blank.
UPDATE "User" SET "hireDate" = "createdAt" WHERE "hireDate" IS NULL;
