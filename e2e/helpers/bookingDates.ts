import { zonedTimeToUtc } from "../../src/lib/timezone";

// Test-only helper. Root cause of the booking-test date collision: two
// fixtures in the same suite each need a Date some N days in the future,
// but if one derives "which day" from the raw UTC calendar (new
// Date(Date.now() + N*86_400_000), then force a UTC hour) and the other
// derives it by formatting into a different timezone's calendar day (e.g.
// America/Los_Angeles, which can be a different calendar date than UTC's
// "today" depending on the hour and DST), the two "N days from now"
// fixtures can silently land on the exact same real-world instant whenever
// their day/hour arithmetic happens to agree — most likely right around a
// UTC/Los-Angeles date-rollover boundary. A collision between two Zoom
// (shared-room) bookings on the same instant is then — correctly —
// excluded as unavailable by the real overlap logic, which looks like an
// unrelated test failure (an expected slot missing from the booking page)
// rather than what it actually is: two fixtures fighting over one slot.
//
// The fix is for every fixture in this file that needs an "N days out"
// instant to go through this one function, so "which calendar day" is
// always decided the same way (America/Los_Angeles' own calendar, not a
// mix of UTC-day-arithmetic and LA-formatted-day). Two different integer
// day offsets through this same function always produce two different
// calendar-date keys, regardless of what the real wall clock says when
// the suite happens to run — there is no longer a second, inconsistent
// method of deciding "today" for anything to disagree with.
export function laCalendarDateKeyPlusDays(days: number, now: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now + days * 86_400_000));
}

// Convenience wrapper: the UTC instant for a given Los-Angeles wall-clock
// time, N days from `now` (real time by default, or a fixed instant for
// a reproducible/offline check — see scripts/verify-booking-date-collision.ts).
export function laDateTimeUtcPlusDays(
  days: number,
  localTime: string,
  now: number = Date.now()
): Date {
  const dateKey = laCalendarDateKeyPlusDays(days, now);
  return zonedTimeToUtc(`${dateKey}T${localTime}`, "America/Los_Angeles");
}
