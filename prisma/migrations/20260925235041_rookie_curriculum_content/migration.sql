-- CreateEnum
CREATE TYPE "RookieContentKind" AS ENUM ('PRACTICAL_LESSON', 'SCENARIO', 'RECAP');

-- CreateTable
CREATE TABLE "RookieContentItem" (
    "id" TEXT NOT NULL,
    "rookieDayId" TEXT NOT NULL,
    "kind" "RookieContentKind" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "titleEn" TEXT NOT NULL,
    "titleEs" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "bodyEs" TEXT NOT NULL,
    "promptEn" TEXT,
    "promptEs" TEXT,
    "revealEn" TEXT,
    "revealEs" TEXT,
    "hasFutureVideoSlot" BOOLEAN NOT NULL DEFAULT false,
    "estimatedMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RookieContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RookieContentSourceLesson" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,

    CONSTRAINT "RookieContentSourceLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RookieContentProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RookieContentProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RookieContentItem_rookieDayId_order_idx" ON "RookieContentItem"("rookieDayId", "order");

-- CreateIndex
CREATE INDEX "RookieContentSourceLesson_lessonId_idx" ON "RookieContentSourceLesson"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "RookieContentSourceLesson_contentItemId_lessonId_key" ON "RookieContentSourceLesson"("contentItemId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "RookieContentProgress_userId_contentItemId_key" ON "RookieContentProgress"("userId", "contentItemId");

-- AddForeignKey
ALTER TABLE "RookieContentItem" ADD CONSTRAINT "RookieContentItem_rookieDayId_fkey" FOREIGN KEY ("rookieDayId") REFERENCES "RookieDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieContentSourceLesson" ADD CONSTRAINT "RookieContentSourceLesson_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "RookieContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieContentSourceLesson" ADD CONSTRAINT "RookieContentSourceLesson_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieContentProgress" ADD CONSTRAINT "RookieContentProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RookieContentProgress" ADD CONSTRAINT "RookieContentProgress_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "RookieContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

