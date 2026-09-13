// The business operates in one timezone regardless of where the app server
// happens to run (Railway containers default to UTC) — so interview times
// typed into a <input type="datetime-local"> need to be interpreted as this
// zone, not whatever zone the Node process is in, and displayed back in it
// too so a server-rendered page shows the same time a browser would.
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "America/Los_Angeles";

// Converts a wall-clock string like "2026-10-15T14:30" (no timezone info,
// as produced by a datetime-local input) into the correct UTC Date for that
// wall-clock time in BUSINESS_TIMEZONE, accounting for DST.
export function zonedTimeToUtc(localDatetime: string): Date {
  const [datePart, timePart] = localDatetime.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number);

  const asUtc = Date.UTC(year, month - 1, day, hour, minute);

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(asUtc)).map((p) => [p.type, p.value]));
  const asIfLocal = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return new Date(asUtc + (asUtc - asIfLocal));
}

// Formats a Date in the business timezone regardless of the server's own
// runtime timezone, so a Server Component renders the same wall-clock time
// a browser in that timezone would show.
export function formatInBusinessTimezone(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

// "YYYY-MM-DD" for a date's calendar day in the business timezone —
// used to key recurring (daily/weekly/monthly) checklist tasks to a period
// regardless of the server's own runtime timezone.
export function businessDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// "YYYY-Www" ISO week key for a date's calendar day in the business timezone.
export function businessISOWeekKey(date: Date): string {
  const [y, m, d] = businessDateKey(date).split("-").map(Number);
  // Compute the ISO week using a UTC-anchored date so the week/day-of-week
  // math isn't affected by the server's own runtime timezone or DST.
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// UTC-midnight Date representing the Friday of the current business-timezone
// week (Mon=1..Sun=7 style ISO weekday, same convention as businessISOWeekKey).
export function fridayOfBusinessWeek(date: Date): Date {
  const [y, m, d] = businessDateKey(date).split("-").map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + (5 - dayNum));
  return utcDate;
}

// UTC-midnight Date for the last day of the current month, in the business
// timezone — e.g. so "due at month-end" means the same calendar day
// regardless of which timezone the server process happens to run in.
export function lastDayOfBusinessMonth(date: Date): Date {
  const [y, m] = businessDateKey(date).split("-").map(Number);
  return new Date(Date.UTC(y, m, 0));
}

// { year, month, day, weekday, hour, minute } of a Date as read in the
// business timezone — weekday is ISO-style (Mon=1..Sun=7).
export function businessTimeParts(date: Date): {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const [y, m, d] = businessDateKey(date).split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}
