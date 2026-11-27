-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'THUMBTACK';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "isTest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "possibleDuplicate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quarantined" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "thumbtackLeadPrice" DOUBLE PRECISION,
ADD COLUMN     "thumbtackRequestUrl" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_externalId_key" ON "Lead"("externalId");

-- CreateIndex
CREATE INDEX "Lead_quarantined_idx" ON "Lead"("quarantined");

