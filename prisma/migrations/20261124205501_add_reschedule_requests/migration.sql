-- CreateEnum
CREATE TYPE "RescheduleType" AS ENUM ('MOVE_KEEP_SCHEDULE', 'MOVE_AND_RESTART', 'SKIP_ONE');

-- CreateEnum
CREATE TYPE "RescheduleWorkStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'CLOSED');

-- CreateEnum
CREATE TYPE "RescheduleDecision" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "RescheduleCloseOutcome" AS ENUM ('COMPLETED', 'DECLINED', 'WITHDRAWN', 'DUPLICATE_OR_INVALID');

-- CreateEnum
CREATE TYPE "RescheduleFeeReview" AS ENUM ('NOT_DECIDED', 'NO_FEE', 'FEE_APPLIES');

-- CreateEnum
CREATE TYPE "RescheduleArrivalWindow" AS ENUM ('WINDOW_830_930', 'WINDOW_800_1130', 'WINDOW_1030_130', 'WINDOW_1200_230', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "RescheduleFrequency" AS ENUM ('WEEKLY', 'EVERY_2_WEEKS', 'EVERY_4_WEEKS', 'MONTHLY', 'NOT_SURE', 'OTHER');

-- CreateEnum
CREATE TYPE "RescheduleOfferOutcome" AS ENUM ('OPEN', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RescheduleMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "RescheduleMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "channel" "CommChannel" NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "RescheduleMessageStatus" NOT NULL DEFAULT 'PENDING',
    "body" TEXT NOT NULL,
    "errorMessage" TEXT,
    "senderById" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RescheduleMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RescheduleNote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RescheduleNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RescheduleRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "note" TEXT,
    "currentAppointmentDate" DATE NOT NULL,
    "type" "RescheduleType" NOT NULL,
    "chosenOptionDate" DATE,
    "chosenOptionBlock" TEXT,
    "chosenOptionWindow" TEXT,
    "chosenOptionFeedMonthId" TEXT,
    "chosenOptionSnapshotTeamsOpen" INTEGER,
    "preferredDateText" TEXT,
    "arrivalWindow" "RescheduleArrivalWindow",
    "frequency" "RescheduleFrequency",
    "workStatus" "RescheduleWorkStatus" NOT NULL DEFAULT 'NEW',
    "decision" "RescheduleDecision" NOT NULL DEFAULT 'PENDING',
    "closeOutcome" "RescheduleCloseOutcome",
    "closeNote" TEXT,
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "matchedInTcsAt" TIMESTAMP(3),
    "matchedInTcsById" TEXT,
    "tcsUpdatedAt" TIMESTAMP(3),
    "tcsUpdatedById" TEXT,
    "firstStaffResponseAt" TIMESTAMP(3),
    "firstStaffResponseById" TEXT,
    "customerInformedAt" TIMESTAMP(3),
    "customerInformedById" TEXT,
    "feeReview" "RescheduleFeeReview" NOT NULL DEFAULT 'NOT_DECIDED',
    "feeReviewNote" TEXT,
    "confirmedDate" DATE,
    "confirmedWindow" TEXT,
    "confirmedOriginalOutcome" TEXT,
    "confirmedRecurrenceText" TEXT,
    "confirmedFeeNotice" TEXT,
    "offerOptionDate" DATE,
    "offerOptionBlock" TEXT,
    "offerOptionWindow" TEXT,
    "offerAt" TIMESTAMP(3),
    "offerText" TEXT,
    "offerOutcome" "RescheduleOfferOutcome",
    "statusTokenHash" TEXT NOT NULL,
    "statusTokenExpiresAt" TIMESTAMP(3),
    "statusTokenRevokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RescheduleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RescheduleMessage_requestId_createdAt_idx" ON "RescheduleMessage"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "RescheduleNote_requestId_createdAt_idx" ON "RescheduleNote"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RescheduleRequest_statusTokenHash_key" ON "RescheduleRequest"("statusTokenHash");

-- CreateIndex
CREATE INDEX "RescheduleRequest_createdAt_idx" ON "RescheduleRequest"("createdAt");

-- CreateIndex
CREATE INDEX "RescheduleRequest_workStatus_idx" ON "RescheduleRequest"("workStatus");

-- CreateIndex
CREATE INDEX "RescheduleRequest_decision_idx" ON "RescheduleRequest"("decision");

-- CreateIndex
CREATE INDEX "RescheduleRequest_claimedById_idx" ON "RescheduleRequest"("claimedById");

-- AddForeignKey
ALTER TABLE "RescheduleMessage" ADD CONSTRAINT "RescheduleMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RescheduleRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleMessage" ADD CONSTRAINT "RescheduleMessage_senderById_fkey" FOREIGN KEY ("senderById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleNote" ADD CONSTRAINT "RescheduleNote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RescheduleRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleNote" ADD CONSTRAINT "RescheduleNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_matchedInTcsById_fkey" FOREIGN KEY ("matchedInTcsById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_tcsUpdatedById_fkey" FOREIGN KEY ("tcsUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_firstStaffResponseById_fkey" FOREIGN KEY ("firstStaffResponseById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_customerInformedById_fkey" FOREIGN KEY ("customerInformedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
