-- One-time backfill: the importer used to set regularHours to the report's
-- "Time" total only, missing any separate "Travel Time" adjustment line
-- (see the accompanying code fix, which now adds travel hours in on every
-- new import). This corrects entries imported before that fix.
--
-- Only touches entries whose regularHours still exactly equals the
-- unmodified report import value (totalHours) -- if HR already edited an
-- entry's hours by hand since import, regularHours will have drifted from
-- totalHours and this intentionally leaves it alone rather than clobbering
-- a manual correction.
--
-- An entry that was already approved (self-signed or HR-recorded via
-- override) gets reopened for a fresh review, the same way any other
-- hours change reopens an entry elsewhere in this app -- the number of
-- hours actually worked changed, so the prior sign-off no longer reflects
-- reality and a new one is needed. A DISPUTED entry is left as disputed
-- (just with corrected hours) for HR to resolve normally; a PENDING entry
-- was never signed, so nothing else needs resetting.
WITH travel AS (
  SELECT "payrollEntryId", SUM(hours) AS travel_hours
  FROM "PayrollAdjustment"
  WHERE type ILIKE '%travel%'
  GROUP BY "payrollEntryId"
)
UPDATE "PayrollEntry" pe
SET
  "regularHours" = pe."totalHours" + travel.travel_hours,
  "status" = CASE WHEN pe."status" = 'APPROVED' THEN 'PENDING' ELSE pe."status" END,
  "signedAt" = CASE WHEN pe."status" = 'APPROVED' THEN NULL ELSE pe."signedAt" END,
  "signedName" = CASE WHEN pe."status" = 'APPROVED' THEN NULL ELSE pe."signedName" END,
  "signedPdfDataUrl" = CASE WHEN pe."status" = 'APPROVED' THEN NULL ELSE pe."signedPdfDataUrl" END,
  "signatureReminderSentAt" = CASE WHEN pe."status" = 'APPROVED' THEN NULL ELSE pe."signatureReminderSentAt" END,
  "signedViaOverride" = CASE WHEN pe."status" = 'APPROVED' THEN false ELSE pe."signedViaOverride" END,
  "overriddenById" = CASE WHEN pe."status" = 'APPROVED' THEN NULL ELSE pe."overriddenById" END,
  "overrideNote" = CASE WHEN pe."status" = 'APPROVED' THEN NULL ELSE pe."overrideNote" END,
  "resolutionNotes" = CASE WHEN pe."status" = 'APPROVED' THEN NULL ELSE pe."resolutionNotes" END,
  "resolvedAt" = CASE WHEN pe."status" = 'APPROVED' THEN NULL ELSE pe."resolvedAt" END
FROM travel
WHERE pe.id = travel."payrollEntryId"
  AND pe."totalHours" IS NOT NULL
  AND travel.travel_hours > 0
  AND pe."regularHours" = pe."totalHours";
