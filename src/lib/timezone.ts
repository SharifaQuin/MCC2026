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
