-- One-time backfill: give every currently-undated One-Time/Milestone task a
-- due date of one week from today, so nothing is left with no deadline at
-- all. Monthly tasks are always due the last day of the month (computed at
-- read time, see getEffectiveTargetDate in lib/checklistDisplay.ts) and
-- Daily/Weekly tasks never use a due date, so neither needs a stored value
-- here. Tasks created after this migration get a tighter 3-day default
-- instead (see addChecklistTaskAction / bulkAddChecklistTasksAction).
UPDATE "ChecklistTask"
SET "targetDate" = (CURRENT_DATE + INTERVAL '7 days')
WHERE "targetDate" IS NULL
  AND "frequency" IN ('ONE_TIME', 'MILESTONE')
  AND "status" != 'DONE';
