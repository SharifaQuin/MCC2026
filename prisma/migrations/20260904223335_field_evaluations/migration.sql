-- CreateTable
CREATE TABLE "FieldEvaluation" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "gradedById" TEXT NOT NULL,
    "fieldDate" TIMESTAMP(3) NOT NULL,
    "generalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldEvalCategoryScore" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "checkedItems" JSONB NOT NULL,
    "notes" TEXT,

    CONSTRAINT "FieldEvalCategoryScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldEvaluation_traineeId_idx" ON "FieldEvaluation"("traineeId");

-- CreateIndex
CREATE INDEX "FieldEvalCategoryScore_evaluationId_idx" ON "FieldEvalCategoryScore"("evaluationId");

-- AddForeignKey
ALTER TABLE "FieldEvaluation" ADD CONSTRAINT "FieldEvaluation_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldEvaluation" ADD CONSTRAINT "FieldEvaluation_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldEvalCategoryScore" ADD CONSTRAINT "FieldEvalCategoryScore_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "FieldEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
