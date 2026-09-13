// Pure display helpers with no server-only imports (no prisma, no next/headers)
// so they're safe to use from client components as well as server ones.
import type { ChecklistCategory, ChecklistFrequency, ChecklistTaskStatus } from "@prisma/client";

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
// the current month, recalculated automatically same as effectiveStatus
// (no manual due date makes sense there). Daily/Weekly tasks already reset
// themselves every period — that reset IS their deadline — so they never
// have a due date at all. Only One-Time/Milestone tasks use whatever's
// actually stored in targetDate.
export function getEffectiveTargetDate(
  task: { frequency: ChecklistFrequency; targetDate: string | Date | null },
  now: Date = new Date()
): Date | null {
  if (task.frequency === "MONTHLY") {
    return new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }
  if (task.frequency === "DAILY" || task.frequency === "WEEKLY") {
    return null;
  }
  return task.targetDate ? new Date(task.targetDate) : null;
}

export type DueStatus = "OVERDUE" | "DUE_SOON" | null;

// A due-date flag shown right on the task — no email, no scheduled job,
// just computed at read time same as effectiveStatus. Done tasks never show
// a flag regardless of date. "Due soon" covers today and the next 2 days.
export function getDueStatus(
  task: { frequency: ChecklistFrequency; targetDate: string | Date | null; effectiveStatus: ChecklistTaskStatus },
  now: Date = new Date()
): DueStatus {
  if (task.effectiveStatus === "DONE") return null;
  const due = getEffectiveTargetDate(task, now);
  if (!due) return null;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const daysUntilDue = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86400000);

  if (daysUntilDue < 0) return "OVERDUE";
  if (daysUntilDue <= 2) return "DUE_SOON";
  return null;
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
