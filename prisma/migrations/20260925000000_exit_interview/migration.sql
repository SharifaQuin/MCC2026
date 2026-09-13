-- AlterTable
ALTER TABLE "User" ADD COLUMN     "rehireEligible" BOOLEAN,
ADD COLUMN     "exitInterviewCompletedAt" TIMESTAMP(3),
ADD COLUMN     "exitInterviewNotes" TEXT;
