-- AlterTable
ALTER TABLE "ChecklistTask" ADD COLUMN "dueFridayOfWeek" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "WeeklyUpdateStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "WeeklyUpdate" (
    "id" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "spotlightName" TEXT NOT NULL,
    "spotlightReason" TEXT NOT NULL,
    "homesCleaned" INTEGER NOT NULL,
    "commercialServiced" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION NOT NULL,
    "clientShoutout" TEXT,
    "companyUpdates" TEXT,
    "weeklyGoal" TEXT NOT NULL,
    "coreValue" TEXT NOT NULL,
    "coreValueDescription" TEXT NOT NULL,
    "formattedMessage" TEXT NOT NULL,
    "status" "WeeklyUpdateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyUpdate_weekOf_key" ON "WeeklyUpdate"("weekOf");

-- AddForeignKey
ALTER TABLE "WeeklyUpdate" ADD CONSTRAINT "WeeklyUpdate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyUpdate" ADD CONSTRAINT "WeeklyUpdate_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
