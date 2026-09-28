-- AlterTable
ALTER TABLE "OnboardingDocument" ADD COLUMN     "sigFieldPage" INTEGER,
ADD COLUMN     "sigFieldX" DOUBLE PRECISION,
ADD COLUMN     "sigFieldY" DOUBLE PRECISION,
ADD COLUMN     "dateFieldPage" INTEGER,
ADD COLUMN     "dateFieldX" DOUBLE PRECISION,
ADD COLUMN     "dateFieldY" DOUBLE PRECISION,
ADD COLUMN     "fieldsAutoDetected" BOOLEAN NOT NULL DEFAULT false;
