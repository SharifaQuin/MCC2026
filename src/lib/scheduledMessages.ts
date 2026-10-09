import { businessTimeParts } from "@/lib/timezone";

// Shared by the schedule action (server) and the Schedule picker (client) —
// pure date math only, no server-only imports, so both can use it.

// "Warn when a text is scheduled between 9pm and 8am" — Pacific wall clock,
// 9:00pm through 7:59am inclusive. Emails have no such warning.
export function isSmsQuietHours(date: Date): boolean {
  const { hour } = businessTimeParts(date);
  return hour >= 21 || hour < 8;
}

export type ScheduleQuickPick = "today_9am" | "today_1pm" | "tomorrow_9am";

// Returns the wall-clock "YYYY-MM-DDTHH:mm" (Pacific) for a quick-pick
// option, suitable for setting directly as the value of the date/time
// inputs this feeds (and, unchanged, as what zonedTimeToUtc expects).
export function resolveQuickPick(pick: ScheduleQuickPick, now: Date = new Date()): string {
  const { year, month, day } = businessTimeParts(now);
  const isTomorrow = pick === "tomorrow_9am";
  // Walk the date forward a day in UTC-anchored terms (same trick used
  // elsewhere in this codebase, e.g. slotCapacitySummary's addDaysIso) —
  // avoids any local-timezone-of-the-server date math entirely.
  const base = new Date(Date.UTC(year, month - 1, day + (isTomorrow ? 1 : 0)));
  const dateKey = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
  const time = pick === "today_1pm" ? "13:00" : "09:00";
  return `${dateKey}T${time}`;
}

export const QUICK_PICKS: { key: ScheduleQuickPick; label: string }[] = [
  { key: "today_9am", label: "Today 9am" },
  { key: "today_1pm", label: "Today 1pm" },
  { key: "tomorrow_9am", label: "Tomorrow 9am" },
];
