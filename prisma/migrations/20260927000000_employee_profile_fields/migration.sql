-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "employmentType" "EmploymentType",
ADD COLUMN "officeLocation" TEXT,
ADD COLUMN "crewType" TEXT,
ADD COLUMN "managerName" TEXT;
