-- AlterEnum
ALTER TYPE "LeadStage" ADD VALUE 'SCAM';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "scamReason" TEXT;

-- AlterTable
ALTER TABLE "ScheduledMessage" ADD COLUMN     "cancelReason" TEXT;
