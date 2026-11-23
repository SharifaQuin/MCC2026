// Pure display helpers with no server-only imports (no prisma, no next/headers)
// so they're safe to use from client components as well as server ones.
import type { ChecklistCategory, ChecklistFrequency, ChecklistTaskStatus } from "@prisma/client";
import { businessDateKey, fridayOfBusinessWeek, lastDayOfBusinessMonth } from "@/lib/timezone";

export const CATEGORY_ORDER: ChecklistCategory[] = ["MARKETING", "SALES", "HR", "MANAGEMENT"];

export const CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  MARKETING: "Marketing",
  SALES: "Sales",
  HR: "HR",
  MANAGEMENT: "Management / Admin",
};

// Groups tasks into to-do-list-style subsections, in a fixed order, skipping
// any category with nothing in it so an unused section doesn't show up empty.
export function groupByCategory<T extends { category: ChecklistCategory }>(
  tasks: T[]
): { category: ChecklistCategory; label: string; tasks: T[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    tasks: tasks.filter((t) => t.category === category),
  })).filter((group) => group.tasks.length > 0);
}

// Once a task reads as Done, it drops out of the active list immediately.
// Daily/Weekly/Monthly tasks just reappear on their own next period (their
// effectiveStatus reverts automatically), so a completed recurring task is
// simply dropped rather than archived. One-Time/Milestone tasks have no
// such reset, so they move to a separate "archived" bucket instead of
// disappearing for good.
export function splitChecklistTasks<
  T extends { effectiveStatus: ChecklistTaskStatus; frequency: ChecklistFrequency }
>(tasks: T[]): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const t of tasks) {
    if (t.effectiveStatus !== "DONE") {
      active.push(t);
    } else if (t.frequency === "ONE_TIME" || t.frequency === "MILESTONE") {
      archived.push(t);
    }
  }
  return { active, archived };
}

// Which growth-staircase stages this month's revenue has already reached.
export function reachedGrowthStages(staircase: number[], revenue: number): boolean[] {
  return staircase.map((amount) => revenue >= amount);
}

// The due date a task actually reads as, given its frequency — not
// necessarily what's stored. Monthly tasks are always due the last day of
// the current month (in the business timezone), recalculated automatically
// same as effectiveStatus (no manual due date makes sense there). Daily/
// Weekly tasks already reset themselves every period — that reset IS their
// deadline — so they never have a due date, unless dueFridayOfWeek opts a
// specific Weekly task into a Friday deadline on top of its weekly reset
// (e.g. the Monday Team Update reminder). One-Time/Milestone tasks use
// whatever's actually stored in targetDate.
export function getEffectiveTargetDate(
  task: { frequency: ChecklistFrequency; targetDate: string | Date | null; dueFridayOfWeek?: boolean },
  now: Date = new Date()
): Date | null {
  if (task.dueFridayOfWeek) {
    return fridayOfBusinessWeek(now);
  }
  if (task.frequency === "MONTHLY") {
    return lastDayOfBusinessMonth(now);
  }
  if (task.frequency === "DAILY" || task.frequency === "WEEKLY") {
    return null;
  }
  return task.targetDate ? new Date(task.targetDate) : null;
}

// Formats a due date for display without letting the viewer's own
// timezone shift its calendar day. `date` (from getEffectiveTargetDate) is
// always UTC-midnight-encoded, so reading it back with the default,
// no-timeZone-argument `toLocaleDateString()` re-interprets those UTC
// Y/M/D digits as if they were local wall-clock time — in a timezone
// behind UTC (e.g. America/Los_Angeles) that lands on the previous local
// calendar day. Pinning the formatter's `timeZone` to "UTC" reads the same
// Y/M/D digits back out directly, so the displayed date matches the
// intended calendar day regardless of which timezone the viewer (or the
// server rendering this, if ever done server-side) is in.
export function formatDueDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export type DueStatus = "OVERDUE" | "DUE_SOON" | null;

// The shared day-math behind both getDueStatus (below) and any
// sort/priority ordering that needs to know "is this overdue / due today /
// later" without re-deriving it — a Done task has no meaningful due-ness
// either way, so this returns null for one same as getDueStatus does.
// `due` is a pure calendar date (UTC-midnight-encoded, whether computed
// here or stored from a plain <input type="date">) — read its Y/M/D
// directly rather than re-interpreting it through the business timezone,
// which would shift a UTC-midnight value back a day. `now`, in contrast,
// is a real moment in time, so what calendar day it currently is DOES
// depend on the business timezone.
export function getDaysUntilDue(
  task: {
    frequency: ChecklistFrequency;
    targetDate: string | Date | null;
    dueFridayOfWeek?: boolean;
    effectiveStatus: ChecklistTaskStatus;
  },
  now: Date = new Date()
): number | null {
  if (task.effectiveStatus === "DONE") return null;
  const due = getEffectiveTargetDate(task, now);
  if (!due) return null;

  const startOfToday = new Date(`${businessDateKey(now)}T00:00:00Z`);
  const startOfDue = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.round((startOfDue - startOfToday.getTime()) / 86400000);
}

// A due-date flag shown right on the task — no email, no scheduled job,
// just computed at read time same as effectiveStatus. Done tasks never show
// a flag regardless of date. "Due soon" covers today and the next 2 days.
// Day counting is done in the business timezone so the badge doesn't shift
// by a day depending on which timezone the server process happens to run in.
export function getDueStatus(
  task: {
    frequency: ChecklistFrequency;
    targetDate: string | Date | null;
    dueFridayOfWeek?: boolean;
    effectiveStatus: ChecklistTaskStatus;
  },
  now: Date = new Date()
): DueStatus {
  const daysUntilDue = getDaysUntilDue(task, now);
  if (daysUntilDue === null) return null;
  if (daysUntilDue < 0) return "OVERDUE";
  if (daysUntilDue <= 2) return "DUE_SOON";
  return null;
}

// Sort priority for "overdue first, then due today, then everything else"
// list ordering — 0/1/2 so callers can Array.prototype.sort on it directly
// (stable sort keeps each bucket's own original ordering otherwise).
export function getDueSortPriority(
  task: {
    frequency: ChecklistFrequency;
    targetDate: string | Date | null;
    dueFridayOfWeek?: boolean;
    effectiveStatus: ChecklistTaskStatus;
  },
  now: Date = new Date()
): 0 | 1 | 2 {
  const daysUntilDue = getDaysUntilDue(task, now);
  if (daysUntilDue === null) return 2;
  if (daysUntilDue < 0) return 0;
  if (daysUntilDue === 0) return 1;
  return 2;
}

// Keyword lists checked in this order (first match wins) — deliberately
// excludes ambiguous words like "payroll", which in this checklist's history
// has meant financial reconciliation (Management/Admin), not an HR task.
const CATEGORY_KEYWORDS: { category: ChecklistCategory; keywords: string[] }[] = [
  {
    category: "MARKETING",
    keywords: ["marketing", "lead", "leads", "campaign", "advertis", "social media", "seo", "brand", "promo"],
  },
  {
    category: "SALES",
    keywords: ["sales", "quote", "quotes", "revenue", "pricing", "pipeline", "conversion", "client win", "deal"],
  },
  {
    category: "HR",
    keywords: [
      "hire",
      "hiring",
      "recruit",
      "employee",
      "onboarding",
      "onboard",
      "interview",
      "certification",
      "certify",
      "training",
      "staff",
    ],
  },
];

// Best-effort category guess from a task's text, for bulk-adding a pasted
// list of tasks without making the owner pick a category for each one by
// hand. Falls back to Management/Admin — same as the field's own default —
// when nothing matches; any guess can be corrected afterward with one click.
export function guessChecklistCategory(taskText: string): ChecklistCategory {
  const lower = taskText.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return "MANAGEMENT";
}
