import type { MilestoneCheckpoint, MilestoneReview } from "@prisma/client";

const CHECKPOINT_DAYS: Record<MilestoneCheckpoint, number> = {
  DAY_30: 30,
  DAY_60: 60,
  DAY_90: 90,
};

export const MILESTONE_CHECKPOINTS: MilestoneCheckpoint[] = ["DAY_30", "DAY_60", "DAY_90"];

export const CHECKPOINT_LABELS: Record<MilestoneCheckpoint, string> = {
  DAY_30: "30-Day Review",
  DAY_60: "60-Day Review",
  DAY_90: "90-Day Review",
};

// Always computed from the employee's real startDate — never stored — since
// a manually-typed tenure field is exactly what went stale and caused
// confusion in the old spreadsheet.
export function getMilestoneDueDate(startDate: Date, checkpoint: MilestoneCheckpoint): Date {
  const due = new Date(startDate);
  due.setDate(due.getDate() + CHECKPOINT_DAYS[checkpoint]);
  return due;
}

export type MilestoneStatus = "COMPLETED" | "OVERDUE" | "DUE_SOON" | "NOT_YET_DUE";

export function getMilestoneStatus(
  dueDate: Date,
  completedAt: Date | null,
  now: Date = new Date()
): MilestoneStatus {
  if (completedAt) return "COMPLETED";
  const daysUntilDue = Math.round((dueDate.getTime() - now.getTime()) / 86400000);
  if (daysUntilDue < 0) return "OVERDUE";
  if (daysUntilDue <= 7) return "DUE_SOON";
  return "NOT_YET_DUE";
}

type ReviewRow = Pick<MilestoneReview, "id" | "checkpoint" | "completedAt" | "score" | "notes" | "reviewedById">;

export interface MilestoneTimelineEntry {
  checkpoint: MilestoneCheckpoint;
  label: string;
  dueDate: Date;
  review: ReviewRow | null;
  status: MilestoneStatus;
}

// Merges the 3 fixed checkpoints for an employee with whatever MilestoneReview
// rows actually exist, so a checkpoint that's already due but never started
// still shows up (as NOT_YET_DUE/OVERDUE) rather than silently not existing.
export function buildMilestoneTimeline(
  startDate: Date,
  reviews: ReviewRow[],
  now: Date = new Date()
): MilestoneTimelineEntry[] {
  const byCheckpoint = new Map(reviews.map((r) => [r.checkpoint, r]));
  return MILESTONE_CHECKPOINTS.map((checkpoint) => {
    const review = byCheckpoint.get(checkpoint) ?? null;
    const dueDate = getMilestoneDueDate(startDate, checkpoint);
    return {
      checkpoint,
      label: CHECKPOINT_LABELS[checkpoint],
      dueDate,
      review,
      status: getMilestoneStatus(dueDate, review?.completedAt ?? null, now),
    };
  });
}
