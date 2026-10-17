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

// ADMIN only — every loan, open and closed, most recently added first within
// their original order.
export async function getLoans() {
  await requireOwnerAccess();
  return prisma.loan.findMany({ orderBy: { order: "asc" } });
}

// ADMIN only — just the open loans, for the Home page loan summary.
export async function getOpenLoans() {
  await requireOwnerAccess();
  return prisma.loan.findMany({ where: { status: "OPEN" }, orderBy: { order: "asc" } });
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

// These two unassigned TEAM tasks (seeded in prisma/seed.ts) ask whoever
// sees them to log leads/marketing spend — work a Trainee has no part in and
// no access to the Marketing & Leads Tracker for. Matched by exact
// task/frequency text rather than id, since a per-install seeded task's id
// isn't stable across installs/reseeds. Every other TEAM task, and these two
// for every other role, are unaffected.
const TRAINEE_EXCLUDED_TEAM_TASKS: { task: string; frequency: ChecklistFrequency }[] = [
  {
    task: "Log any new lead/client in the Marketing & Leads Tracker (source, type, value)",
    frequency: "DAILY",
  },
  { task: "Check in on Marketing spend vs. leads generated so far", frequency: "WEEKLY" },
];

// Role-scoped checklist read: ADMIN (the Owner) sees every task. For
// everyone else, assignment is a hard privacy boundary, not just a label:
// once a task has an assigneeId, it's visible to exactly that one person
// (plus the Owner) — the stored visibility (Owner-only/Team) is irrelevant
// and never widens who else can see it. An unassigned task keeps the
// existing visibility rule (Team-visible to everyone who can reach this
// query; Owner-only to no one but the Owner).
export async function getChecklistTasksForRole(
  role: Role,
  userId?: string
): Promise<ChecklistTaskWithEffectiveStatus[]> {
  const baseWhere =
    role === "ADMIN"
      ? undefined
      : userId
        ? { OR: [{ assigneeId: null, visibility: "TEAM" as const }, { assigneeId: userId }] }
        : { assigneeId: null, visibility: "TEAM" as const };

  const tasks = await prisma.checklistTask.findMany({
    where:
      role === "TRAINEE" && baseWhere
        ? { AND: [baseWhere, { NOT: TRAINEE_EXCLUDED_TEAM_TASKS }] }
        : baseWhere,
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const now = new Date();
  return tasks.map((t) => ({ ...t, effectiveStatus: effectiveChecklistStatus(t, now) }));
}

// Every active, real (non-test) staff member who can be handed a checklist
// task — every role except ADMIN (the owner does the assigning, not the
// other way around). Broader than lib/staff.ts's STAFF_ROLES, which
// excludes Office Assistant.
export async function getChecklistAssigneeCandidates() {
  return prisma.user.findMany({
    where: {
      role: { in: ["TRAINEE", "TRAINER", "SERVICE_MANAGER", "OFFICE_ASSISTANT"] },
      active: true,
      isTestAccount: false,
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
