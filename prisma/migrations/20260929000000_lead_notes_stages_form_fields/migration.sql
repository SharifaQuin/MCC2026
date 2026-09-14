-- CreateTable
CREATE TABLE "LeadNote" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadNote_leadId_createdAt_idx" ON "LeadNote"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill any already-saved freeform notes into the new activity log
-- before dropping the old column. Each Lead had at most one "notes" value,
-- so "legacynote_" || id is guaranteed unique as the new row's id.
INSERT INTO "LeadNote" ("id", "leadId", "authorId", "body", "createdAt")
SELECT 'legacynote_' || "id", "id", NULL, "notes", "updatedAt"
FROM "Lead"
WHERE "notes" IS NOT NULL AND trim("notes") <> '';

-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "notes",
ADD COLUMN "customFields" JSONB;

-- CreateTable
CREATE TABLE "LeadStageChange" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromStage" "LeadStage",
    "toStage" "LeadStage" NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadStageChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadStageChange_leadId_createdAt_idx" ON "LeadStageChange"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadStageChange" ADD CONSTRAINT "LeadStageChange_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStageChange" ADD CONSTRAINT "LeadStageChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "LeadFormFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'SELECT');

-- CreateTable
CREATE TABLE "LeadFormField" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "LeadFormFieldType" NOT NULL DEFAULT 'TEXT',
    "placeholder" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadFormField_pkey" PRIMARY KEY ("id")
);
