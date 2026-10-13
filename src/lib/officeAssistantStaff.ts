import { prisma } from "@/lib/prisma";
import { STAFF_ROLES, yearsOfService } from "@/lib/staff";
import { getCurrentPairForEmployee } from "@/lib/pairing";
import {
  getCurrentTrainerForTrainee,
  getTrainerCandidates,
  getTrainingAssignmentHistoryForTrainee,
} from "@/lib/trainingAssignment";
import { buildMilestoneTimeline } from "@/lib/milestones";

// A deliberately separate, narrow data path for Office Assistant's Staff
// Directory — it never calls loadEmployeeDetail()/getStaffDirectory() (which
// fetch payroll, complaints, PAFs, signed documents, compliance docs, etc.),
// so none of that ever gets queried, let alone rendered, for this role. Only
// the fields the brief names are selected at all: work contact, employment
// status, onboarding/training milestones, and assigned supervisor/pair.

function supervisorName(managerName: string | null, pair: { partner: { name: string } } | null): string | null {
  return pair?.partner.name ?? managerName ?? null;
}

export async function getOfficeAssistantStaffDirectory() {
  const staff = await prisma.user.findMany({
    where: { role: { in: STAFF_ROLES }, active: true, isTestAccount: false },
    orderBy: { name: "asc" },
    select: {
      id: true,
      employeeId: true,
      name: true,
      role: true,
      hireDate: true,
      officeLocation: true,
      crewType: true,
      managerName: true,
    },
  });

  const milestoneReviewRows = await prisma.milestoneReview.findMany({
    select: { employeeId: true },
  });
  const milestoneCompletedCount = new Map<string, number>();
  for (const r of milestoneReviewRows) {
    milestoneCompletedCount.set(r.employeeId, (milestoneCompletedCount.get(r.employeeId) ?? 0) + 1);
  }

  return Promise.all(
    staff.map(async (s) => {
      const pair = await getCurrentPairForEmployee(s.id);
      return {
        id: s.id,
        employeeId: s.employeeId,
        name: s.name,
        roleLabel: s.role === "TRAINEE" ? "Technician" : s.role === "TRAINER" ? "Trainer" : "Service Manager",
        yearsOfService: s.hireDate ? yearsOfService(s.hireDate) : null,
        officeLocation: s.officeLocation,
        crewType: s.crewType,
        supervisorName: supervisorName(s.managerName, pair),
        milestonesCompleted: milestoneCompletedCount.get(s.id) ?? 0,
      };
    })
  );
}

export async function getOfficeAssistantEmployeeDetail(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, isTestAccount: false },
    select: {
      id: true,
      name: true,
      employeeId: true,
      role: true,
      active: true,
      hireDate: true,
      lastDay: true,
      phone: true,
      officeLocation: true,
      crewType: true,
      managerName: true,
    },
  });
  if (!user) return null;

  const [onboardingDocs, pair, currentTrainer, trainerCandidates, trainingHistory] = await Promise.all([
    prisma.onboardingAssignment.findMany({
      where: { userId },
      orderBy: { document: { order: "asc" } },
      select: { id: true, signedAt: true, document: { select: { title: true } } },
    }),
    getCurrentPairForEmployee(userId),
    user.role === "TRAINEE" ? getCurrentTrainerForTrainee(userId) : null,
    user.role === "TRAINEE" ? getTrainerCandidates() : [],
    user.role === "TRAINEE" ? getTrainingAssignmentHistoryForTrainee(userId) : [],
  ]);

  const milestoneReviewRows = await prisma.milestoneReview.findMany({ where: { employeeId: userId } });
  const milestoneTimeline = user.hireDate
    ? buildMilestoneTimeline(user.hireDate, milestoneReviewRows).map((entry) => ({
        checkpoint: entry.checkpoint,
        label: entry.label,
        dueDate: entry.dueDate.toISOString(),
        status: entry.status,
      }))
    : [];

  return {
    id: user.id,
    name: user.name,
    employeeId: user.employeeId,
    roleLabel: user.role === "TRAINEE" ? "Technician" : user.role === "TRAINER" ? "Trainer" : "Service Manager",
    employmentStatus: user.active ? "Active" : "Departed",
    hireDate: user.hireDate ? user.hireDate.toISOString() : null,
    lastDay: user.lastDay ? user.lastDay.toISOString() : null,
    phone: user.phone,
    officeLocation: user.officeLocation,
    crewType: user.crewType,
    supervisorName: supervisorName(user.managerName, pair),
    isTrainee: user.role === "TRAINEE",
    currentTrainer: currentTrainer
      ? {
          assignmentId: currentTrainer.assignmentId,
          trainerId: currentTrainer.trainerId,
          trainerName: currentTrainer.trainerName,
          startDate: currentTrainer.startDate.toISOString(),
        }
      : null,
    trainerCandidates,
    trainingHistory,
    onboarding: onboardingDocs.map((d) => ({
      id: d.id,
      title: d.document.title,
      status: d.signedAt ? "Completed" : "Pending",
    })),
    milestoneTimeline,
  };
}
