-- CreateEnum
CREATE TYPE "Department" AS ENUM ('SALES', 'HR', 'OPERATIONS', 'MANAGEMENT');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SERVICE_MANAGER';

-- CreateTable
CREATE TABLE "DepartmentAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentAccess_userId_department_key" ON "DepartmentAccess"("userId", "department");

-- AddForeignKey
ALTER TABLE "DepartmentAccess" ADD CONSTRAINT "DepartmentAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
