"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { MilestoneCheckpoint } from "@prisma/client";

export interface MilestoneReviewState {
  error?: string;
  success?: boolean;
}

async function requireHrAccess() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER")) {
    throw new Error("Not authorized");
  }
  return session;
}

function revalidateEmployeeViews(employeeId: string) {
  revalidatePath(`/staff/${employeeId}`);
  revalidatePath(`/admin/employees/${employeeId}`);
}

const VALID_CHECKPOINTS = new Set(["DAY_30", "DAY_60", "DAY_90"]);

export async function upsertMilestoneReviewAction(
  employeeId: string,
  checkpointRaw: string,
  _prevState: MilestoneReviewState,
  formData: FormData
): Promise<MilestoneReviewState> {
  let session;
  try {
    session = await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  if (!VALID_CHECKPOINTS.has(checkpointRaw)) {
    return { error: "Invalid checkpoint." };
  }
  const checkpoint = checkpointRaw as MilestoneCheckpoint;

  const completed = formData.get("completed") === "on";
  const scoreRaw = String(formData.get("score") ?? "").trim();
  const score = scoreRaw ? Number(scoreRaw) : null;
  if (scoreRaw && (Number.isNaN(score) || score! < 0 || score! > 100)) {
    return { error: "Score must be a number between 0 and 100." };
  }
  const notes = String(formData.get("notes") ?? "").trim() || null;

  await prisma.milestoneReview.upsert({
    where: { employeeId_checkpoint: { employeeId, checkpoint } },
    create: {
      employeeId,
      checkpoint,
      completedAt: completed ? new Date() : null,
      score,
      notes,
      reviewedById: session.sub,
    },
    update: {
      completedAt: completed ? new Date() : null,
      score,
      notes,
      reviewedById: session.sub,
    },
  });

  revalidateEmployeeViews(employeeId);
  return { success: true };
}

// Clears a review back to "not started" (computed status resumes from the
// due date alone) rather than leaving stale partial notes/score behind.
export async function resetMilestoneReviewAction(reviewId: string, employeeId: string) {
  await requireHrAccess();
  await prisma.milestoneReview.delete({ where: { id: reviewId } });
  revalidateEmployeeViews(employeeId);
}
