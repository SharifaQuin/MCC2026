-- CreateEnum
CREATE TYPE "PrescreenQuestionType" AS ENUM ('SINGLE_SELECT', 'MULTI_SELECT', 'TEXT', 'DATE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PrescreenQuestionCategory" ADD VALUE 'QUALIFICATION';
ALTER TYPE "PrescreenQuestionCategory" ADD VALUE 'APPLICATION';
ALTER TYPE "PrescreenQuestionCategory" ADD VALUE 'CULTURE_BEHAVIORAL';
ALTER TYPE "PrescreenQuestionCategory" ADD VALUE 'OPTIONAL';

-- DropForeignKey
ALTER TABLE "PrescreenAnswer" DROP CONSTRAINT "PrescreenAnswer_optionId_fkey";

-- DropIndex
DROP INDEX "PrescreenAnswer_applicantId_questionId_key";

-- AlterTable
ALTER TABLE "PrescreenAnswer" ADD COLUMN     "answerText" TEXT,
ALTER COLUMN "optionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PrescreenQuestion" ADD COLUMN     "conditionalOnOptionId" TEXT,
ADD COLUMN     "maxLength" INTEGER,
ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stepLabel" TEXT,
ADD COLUMN     "type" "PrescreenQuestionType" NOT NULL DEFAULT 'SINGLE_SELECT';

-- CreateIndex
CREATE INDEX "PrescreenAnswer_applicantId_questionId_idx" ON "PrescreenAnswer"("applicantId", "questionId");

-- CreateIndex
CREATE INDEX "PrescreenQuestion_conditionalOnOptionId_idx" ON "PrescreenQuestion"("conditionalOnOptionId");

-- AddForeignKey
ALTER TABLE "PrescreenQuestion" ADD CONSTRAINT "PrescreenQuestion_conditionalOnOptionId_fkey" FOREIGN KEY ("conditionalOnOptionId") REFERENCES "PrescreenOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescreenAnswer" ADD CONSTRAINT "PrescreenAnswer_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PrescreenOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

