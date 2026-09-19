import { prisma } from "@/lib/prisma";

// Who a trainee can be assigned to for training — active Trainers only.
export async function getTrainerCandidates() {
  return prisma.user.findMany({
    where: { role: "TRAINER", active: true, isTestAccount: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getCurrentTrainerForTrainee(traineeId: string) {
  const assignment = await prisma.trainingAssignment.findFirst({
    where: { traineeId, active: true },
    include: { trainer: { select: { id: true, name: true } } },
  });
  if (!assignment) return null;
  return {
    assignmentId: assignment.id,
    trainerId: assignment.trainer.id,
    trainerName: assignment.trainer.name,
    startDate: assignment.startDate,
  };
}

export interface TrainingAssignmentHistoryRow {
  id: string;
  trainerName: string;
  startDate: Date;
  endDate: Date | null;
  active: boolean;
  createdByName: string;
}

// Assignment history is manager/admin only — never shown to the trainee or
// trainer themselves. Callers must gate access before calling this.
export async function getTrainingAssignmentHistoryForTrainee(
  traineeId: string
): Promise<TrainingAssignmentHistoryRow[]> {
  const rows = await prisma.trainingAssignment.findMany({
    where: { traineeId },
    include: {
      trainer: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { startDate: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    trainerName: r.trainer.name,
    startDate: r.startDate,
    endDate: r.endDate,
    active: r.active,
    createdByName: r.createdBy.name,
  }));
}

// The scoping boundary for what a Trainer can see in the portal —
// /trainer/employees, /trainer/employees/[id], and the Trainer home page
// all restrict to this list.
export async function getAssignedTraineeIds(trainerId: string): Promise<string[]> {
  const rows = await prisma.trainingAssignment.findMany({
    where: { trainerId, active: true },
    select: { traineeId: true },
  });
  return rows.map((r) => r.traineeId);
}

// A read-only "currently training" list shown on a Trainer's own HR
// profile, so ADMIN/SERVICE_MANAGER can see at a glance who's assigned to
// them without having to check every trainee's profile individually.
export async function getAssignedTraineesForTrainer(trainerId: string) {
  const rows = await prisma.trainingAssignment.findMany({
    where: { trainerId, active: true },
    include: { trainee: { select: { id: true, name: true } } },
    orderBy: { trainee: { name: "asc" } },
  });
  return rows.map((r) => ({ id: r.trainee.id, name: r.trainee.name, startDate: r.startDate }));
}
