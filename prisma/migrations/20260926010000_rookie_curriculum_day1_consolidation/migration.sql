-- AlterEnum
ALTER TYPE "RookieContentKind" ADD VALUE 'ORIENTATION';

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "supersededByLessonId" TEXT;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_supersededByLessonId_fkey" FOREIGN KEY ("supersededByLessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

