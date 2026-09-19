"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export interface TrainingAssignmentState {
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

function revalidateEmployeeViews(traineeId: string, trainerId?: string) {
  revalidatePath(`/staff/${traineeId}`);
  revalidatePath(`/admin/employees/${traineeId}`);
  revalidatePath("/trainer/employees");
  revalidatePath("/");
  if (trainerId) {
    revalidatePath(`/staff/${trainerId}`);
    revalidatePath(`/admin/employees/${trainerId}`);
    revalidatePath(`/trainer/employees/${trainerId}`);
  }
}

// Assigns `traineeId` to a trainer, closing out whatever active assignment
// that trainee already had (history is preserved — the old row is closed,
// never deleted). Unlike Pair, the trainer side is never touched: a
// Trainer can have several trainees active at once.
export async function assignTrainerAction(
  traineeId: string,
  _prevState: TrainingAssignmentState,
  formData: FormData
): Promise<TrainingAssignmentState> {
  let session;
  try {
    session = await requireHrAccess();
  } catch {
    return { error: "Not authorized." };
  }

  const trainerId = String(formData.get("trainerId") ?? "").trim();
  const startDateRaw = String(formData.get("startDate") ?? "");
  const startDate = startDateRaw ? new Date(startDateRaw) : new Date();

  if (!trainerId) {
    return { error: "Please choose a trainer." };
  }
  if (trainerId === traineeId) {
    return { error: "An employee can't be assigned as their own trainer." };
  }

  const trainer = await prisma.user.findUnique({ where: { id: trainerId }, select: { id: true } });
  if (!trainer) {
    return { error: "That trainer could not be found." };
  }

  await prisma.$transaction([
    prisma.trainingAssignment.updateMany({
      where: { traineeId, active: true },
      data: { active: false, endDate: startDate },
    }),
    prisma.trainingAssignment.create({
      data: { trainerId, traineeId, startDate, createdById: session.sub },
    }),
  ]);

  revalidateEmployeeViews(traineeId, trainerId);
  return { success: true };
}

// Ends an assignment without starting a replacement — manual only, never
// automatic (e.g. certifying a trainee does not end it by itself).
export async function endTrainingAssignmentAction(
  assignmentId: string,
  traineeId: string,
  trainerId: string
) {
  await requireHrAccess();
  await prisma.trainingAssignment.update({
    where: { id: assignmentId },
    data: { active: false, endDate: new Date() },
  });
  revalidateEmployeeViews(traineeId, trainerId);
}
