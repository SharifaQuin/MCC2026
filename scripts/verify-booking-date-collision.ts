// Read-only, no DB/network access — pure date-math reproduction of the
// e2e/interview-scheduling-fixes-round2.spec.ts booking-test date
// collision (rollback-check test vs re-inviting test), and proof that the
// fix (e2e/helpers/bookingDates.ts) removes it. Every "now" below is an
// injected fake instant, never the real wall clock, so this never touches
// a real booking, calendar event, or message — see the "ORIGINAL (buggy)"
// section for what each test used to compute before the fix.
//
// Run with: npx tsx scripts/verify-booking-date-collision.ts
import { laCalendarDateKeyPlusDays, laDateTimeUtcPlusDays } from "../e2e/helpers/bookingDates";
import { zonedTimeToUtc } from "../src/lib/timezone";

function originalRollbackTime(now: number): Date {
  // The rollback-check test's old computation: raw UTC calendar-day
  // arithmetic, then force a fixed UTC hour.
  const t = new Date(now + 12 * 86_400_000);
  t.setUTCHours(18, 0, 0, 0);
  return t;
}

function originalReinviteTime(now: number): Date {
  // The re-inviting test's old computation: format "now + 13 days" into
  // the Los-Angeles calendar day, then convert a fixed LA local time back
  // to UTC — a different method of deciding "which day" than the one
  // above.
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now + 13 * 86_400_000));
  return zonedTimeToUtc(`${dateKey}T10:00`, "America/Los_Angeles");
}

function fixedRollbackTime(now: number): Date {
  return laDateTimeUtcPlusDays(12, "11:00", now);
}

function fixedReinviteTime(now: number): Date {
  return laDateTimeUtcPlusDays(19, "10:00", now);
}

interface Case {
  label: string;
  now: string;
}

const cases: Case[] = [
  { label: "Reported failing instant", now: "2026-10-23T00:13:00Z" },
  { label: "Reported previously-passing instant", now: "2026-10-22T23:48:00Z" },
  { label: "Just before US DST ends (2026-11-01 ~09:00 UTC, 01:59 PDT)", now: "2026-11-01T08:59:00Z" },
  { label: "Just after US DST ends (2026-11-01 ~09:00 UTC, 01:00 PST)", now: "2026-11-01T09:01:00Z" },
  { label: "UTC midnight exactly", now: "2026-01-15T00:00:00Z" },
  { label: "UTC noon (far from any rollover)", now: "2026-06-15T12:00:00Z" },
  { label: "Just before UTC midnight", now: "2026-03-10T23:59:30Z" },
];

let anyOriginalCollision = false;
let anyFixedCollision = false;

for (const { label, now } of cases) {
  const nowMs = new Date(now).getTime();

  const origRollback = originalRollbackTime(nowMs);
  const origReinvite = originalReinviteTime(nowMs);
  const origCollides = origRollback.getTime() === origReinvite.getTime();
  anyOriginalCollision ||= origCollides;

  const fixedRollback = fixedRollbackTime(nowMs);
  const fixedReinvite = fixedReinviteTime(nowMs);
  const fixedRollbackDay = laCalendarDateKeyPlusDays(12, nowMs);
  const fixedReinviteDay = laCalendarDateKeyPlusDays(19, nowMs);
  const fixedSameDay = fixedRollbackDay === fixedReinviteDay;
  // 30-min duration, 0-45 min buffers across these tests — a gap under an
  // hour between two Zoom bookings on genuinely different calendar days
  // is already impossible (they're >23h apart by construction once the
  // days differ), so the only thing worth asserting post-fix is that the
  // two calendar days are never equal.
  anyFixedCollision ||= fixedSameDay;

  console.log(`\n${label} (now=${now})`);
  console.log(
    `  ORIGINAL  rollback=${origRollback.toISOString()}  reinvite=${origReinvite.toISOString()}  ${
      origCollides ? "COLLISION ✗" : "distinct ✓"
    }`
  );
  console.log(
    `  FIXED     rollback=${fixedRollback.toISOString()} (day ${fixedRollbackDay})  reinvite=${fixedReinvite.toISOString()} (day ${fixedReinviteDay})  ${
      fixedSameDay ? "SAME DAY ✗" : "distinct days ✓"
    }`
  );
}

console.log("\n---");
console.log(
  `Original logic collided on at least one case: ${anyOriginalCollision ? "YES (confirms the reported bug)" : "no"}`
);
console.log(`Fixed logic collided (same calendar day) on any case: ${anyFixedCollision ? "YES — BUG" : "no ✓"}`);

if (!anyOriginalCollision) {
  console.error("\nExpected the original logic to reproduce the reported collision but it did not.");
  process.exitCode = 1;
}
if (anyFixedCollision) {
  console.error("\nThe fixed logic still produced a same-day collision — fix is incomplete.");
  process.exitCode = 1;
}
