-- AlterTable
ALTER TABLE "User" ADD COLUMN "employeeId" TEXT;

-- Backfill existing users with a sequential human-facing ID, oldest first.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "User"
)
UPDATE "User" u
SET "employeeId" = 'MCC-' || LPAD(ordered.rn::text, 4, '0')
FROM ordered
WHERE u."id" = ordered."id";

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- A sequence backs every future employeeId assignment (app code calls
-- nextval via generateNextEmployeeId()) — advanced past the backfilled
-- range so newly created users continue the same numbering.
CREATE SEQUENCE "employee_id_seq";
SELECT setval('employee_id_seq', (SELECT COUNT(*) FROM "User"));
