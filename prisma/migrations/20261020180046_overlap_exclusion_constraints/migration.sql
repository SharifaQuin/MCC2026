-- AlterTable
ALTER TABLE "InterviewAvailabilitySlot" ADD COLUMN     "bufferedEndsAt" TIMESTAMP(3),
ADD COLUMN     "bufferedStartsAt" TIMESTAMP(3);

-- Required for the GiST-indexed EXCLUDE constraints below (range overlap
-- checks on btree-comparable columns like "text" and "timestamp").
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Atomic, database-level overlap enforcement. A same-start unique key
-- (InterviewAvailabilitySlot_interviewerId_startsAt_key) only ever catches
-- two bookings claiming the *exact same instant* — it does nothing for two
-- bookings whose start times differ but whose buffered ranges still
-- overlap, which a read-then-insert application check can race on no
-- matter how it's written. These EXCLUDE constraints make Postgres itself
-- refuse the conflicting INSERT, so a genuine concurrent race is rejected
-- atomically regardless of timing.
--
-- Only rows with a real buffered range participate (every row this feature
-- inserts always sets both columns); pre-existing legacy flat slots (NULL
-- interviewerId/format/bufferedStartsAt) are untouched and never
-- constrained by either clause below.

-- Same interviewer, overlapping buffered ranges. tsrange (not tstzrange) is
-- used deliberately: both columns are "timestamp without time zone" (this
-- app always stores/compares them as UTC instants, same as every other
-- DateTime in this schema), and tstzrange's implicit timestamp->timestamptz
-- cast depends on the session's TimeZone setting, which Postgres refuses
-- to use in a GiST index expression ("functions in index expression must
-- be marked IMMUTABLE").
ALTER TABLE "InterviewAvailabilitySlot"
  ADD CONSTRAINT "InterviewAvailabilitySlot_no_interviewer_overlap"
  EXCLUDE USING gist (
    "interviewerId" WITH =,
    tsrange("bufferedStartsAt", "bufferedEndsAt", '[)') WITH &&
  )
  WHERE ("bookedById" IS NOT NULL AND "interviewerId" IS NOT NULL AND "bufferedStartsAt" IS NOT NULL AND "bufferedEndsAt" IS NOT NULL);

-- Any two interviewers' Zoom bookings, overlapping buffered ranges — the
-- one shared Zoom room can only ever host one interview at a time.
ALTER TABLE "InterviewAvailabilitySlot"
  ADD CONSTRAINT "InterviewAvailabilitySlot_no_zoom_room_overlap"
  EXCLUDE USING gist (
    tsrange("bufferedStartsAt", "bufferedEndsAt", '[)') WITH &&
  )
  WHERE ("bookedById" IS NOT NULL AND "format" = 'ZOOM' AND "bufferedStartsAt" IS NOT NULL AND "bufferedEndsAt" IS NOT NULL);
