// Pure display helpers with no server-only imports (no prisma, no next/headers)
// so they're safe to use from client components as well as server ones.
import type { ChecklistFrequency, ChecklistTaskStatus } from "@prisma/client";

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
