-- CreateEnum
CREATE TYPE "ApplicantSource" AS ENUM ('CAREERS_PAGE', 'INDEED', 'ZIPRECRUITER', 'REFERRAL', 'WALK_IN', 'OTHER');

-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN "source" "ApplicantSource" NOT NULL DEFAULT 'OTHER';
