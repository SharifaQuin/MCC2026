import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { businessDateKey, businessISOWeekKey } from "@/lib/timezone";
import type { ChecklistFrequency, ChecklistTask, ChecklistTaskStatus, Role } from "@prisma/client";

async function requireOwnerAccess() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session;
}

async function requireManagementAccess() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER")) {
    throw new Error("Not authorized");
  }
  return session;
}

// ADMIN only — the full monthly P&L history, most recent month first.
export async function getMonthlyFinancials() {
  await requireOwnerAccess();
  return prisma.monthlyFinancials.findMany({ orderBy: { month: "desc" } });
}

// ADMIN only — a single month's full P&L record.
export async function getMonthlyFinancialsForMonth(month: string) {
  await requireOwnerAccess();
  return prisma.monthlyFinancials.findUnique({ where: { month } });
}

// ADMIN only — the most recent month on record, for a dashboard snapshot.
export async function getLatestMonthlyFinancials() {
  await requireOwnerAccess();
  return prisma.monthlyFinancials.findFirst({ orderBy: { month: "desc" } });
}

// ADMIN only — owner_settings as a plain key→value record.
export async function getOwnerSettings(): Promise<Record<string, unknown>> {
  await requireOwnerAccess();
  const rows = await prisma.ownerSetting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ADMIN + SERVICE_MANAGER — team_goals as a plain key→value record.
export async function getTeamGoals(): Promise<Record<string, unknown>> {
  await requireManagementAccess();
  const rows = await prisma.teamGoal.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function periodKey(frequency: ChecklistFrequency, date: Date): string {
  if (frequency === "DAILY") return businessDateKey(date);
  if (frequency === "WEEKLY") return businessISOWeekKey(date);
  return businessDateKey(date).slice(0, 7); // "YYYY-MM"
}

// DAILY/WEEKLY/MONTHLY tasks auto-revert to Not Started once the calendar
// period they were last touched in has passed — computed at read time from
// `updatedAt` rather than stored, so there's no cron job to keep in sync.
// ONE_TIME/MILESTONE tasks keep whatever status was last set, permanently.
export function effectiveChecklistStatus(
  task: Pick<ChecklistTask, "frequency" | "status" | "updatedAt">,
  now: Date = new Date()
): ChecklistTaskStatus {
  if (task.status === "NOT_STARTED") return "NOT_STARTED";
  if (task.frequency === "ONE_TIME" || task.frequency === "MILESTONE") return task.status;

  return periodKey(task.frequency, task.updatedAt) === periodKey(task.frequency, now)
    ? task.status
    : "NOT_STARTED";
}

export type ChecklistTaskWithEffectiveStatus = ChecklistTask & {
  effectiveStatus: ChecklistTaskStatus;
};

// Role-scoped checklist read: ADMIN sees every task; everyone else (in
// practice SERVICE_MANAGER, the only other role that reaches the home page)
// only ever sees rows with visibility = TEAM.
export async function getChecklistTasksForRole(
  role: Role
): Promise<ChecklistTaskWithEffectiveStatus[]> {
  const tasks = await prisma.checklistTask.findMany({
    where: role === "ADMIN" ? undefined : { visibility: "TEAM" },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const now = new Date();
  return tasks.map((t) => ({ ...t, effectiveStatus: effectiveChecklistStatus(t, now) }));
}
