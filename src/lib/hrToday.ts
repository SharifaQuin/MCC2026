import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/staff";
import { buildMilestoneTimeline } from "@/lib/milestones";
import { NEEDS_DECISION_STAGES, SCHEDULING_STAGES } from "@/lib/recruiting";
import { businessDayRangeUtc } from "@/lib/timezone";
import { effectiveChecklistStatus } from "@/lib/financials";
import { getDueStatus } from "@/lib/checklistDisplay";
import type { ApplicantStage } from "@prisma/client";

export interface HrTodayItem {
  label: string;
  count: number;
  href: string;
  tone: "warn" | "bad";
}

// A single cross-cutting "what needs a look today" list, pulling one count
// from each HR sub-area built this session — meant to be the first thing an
// HR/ops person checks each morning rather than clicking through every page.
export async function getHrTodayAttentionItems(): Promise<HrTodayItem[]> {
  const [
    pendingCertifications,
    openComplaints,
    payrollDisputes,
    needsDecisionApplicants,
    benchedApplicants,
    draftPafs,
    approvedPafs,
    unsignedDocuments,
    overdueReassessments,
    staffWithHireDates,
    expiredOrExpiringCompliance,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "TRAINEE", certificationStatus: "PENDING", isTestAccount: false } }),
    prisma.complaint.count({ where: { status: "OPEN" } }),
    prisma.payrollEntry.count({ where: { status: "DISPUTED" } }),
    prisma.applicant.count({ where: { stage: { in: NEEDS_DECISION_STAGES } } }),
    prisma.applicant.count({ where: { stage: "BENCH" } }),
    prisma.personnelActionForm.count({ where: { status: "DRAFT" } }),
    prisma.personnelActionForm.count({ where: { status: "APPROVED" } }),
    prisma.signedDocument.count({ where: { signedAt: null } }),
    prisma.promotionAssessment.count({
      where: { decision: "DEVELOP", reassessmentDate: { lte: new Date() } },
    }),
    prisma.user.findMany({
      where: { role: { in: STAFF_ROLES }, active: true, hireDate: { not: null }, isTestAccount: false },
      select: { id: true, hireDate: true, milestoneReviews: true },
    }),
    prisma.complianceDocument.count({
      where: { expirationDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
    }),
  ]);

  const overdueMilestones = staffWithHireDates.reduce((count, s) => {
    const timeline = buildMilestoneTimeline(s.hireDate!, s.milestoneReviews);
    return count + timeline.filter((t) => t.status === "OVERDUE").length;
  }, 0);

  const items: HrTodayItem[] = [
    { label: "Applicants needing a decision", count: needsDecisionApplicants + benchedApplicants, href: "/recruiting", tone: "warn" },
    { label: "Certifications pending review", count: pendingCertifications, href: "/admin", tone: "warn" },
    { label: "Open complaints", count: openComplaints, href: "/staff", tone: "bad" },
    { label: "Payroll disputes", count: payrollDisputes, href: "/staff", tone: "bad" },
    { label: "Overdue milestone reviews", count: overdueMilestones, href: "/staff", tone: "bad" },
    { label: "Development reassessments due", count: overdueReassessments, href: "/staff", tone: "warn" },
    { label: "Draft PAFs awaiting approval", count: draftPafs, href: "/staff", tone: "warn" },
    { label: "Approved PAFs awaiting execution", count: approvedPafs, href: "/staff", tone: "warn" },
    { label: "Personnel documents awaiting signature", count: unsignedDocuments, href: "/staff", tone: "warn" },
    { label: "Compliance documents expired or expiring soon", count: expiredOrExpiringCompliance, href: "/staff", tone: "bad" },
  ];

  return items.filter((item) => item.count > 0);
}

export function buildHrDigestMessage(items: HrTodayItem[]): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const lines = items.map((item) => `• ${item.label}: *${item.count}*`);
  return [":clipboard: *HR Needs Attention Today*", "", ...lines, "", `${appUrl}/hr`].join("\n");
}

export interface TodayInterview {
  applicantId: string;
  name: string;
  stage: ApplicantStage;
  scheduledAt: string;
}

export interface TodayFollowUp {
  leadId: string;
  name: string;
  followUpDueAt: string;
}

export interface TodayOverdueTask {
  id: string;
  task: string;
  targetDate: string | null;
}

export interface TodayPendingPayroll {
  entryId: string;
  employeeName: string;
  payPeriodLabel: string;
}

export interface TodayCardData {
  interviews: TodayInterview[];
  followUpsDue: TodayFollowUp[];
  overdueTasks: TodayOverdueTask[];
  pendingPayroll: TodayPendingPayroll[];
}

export interface TodayCardAccess {
  // Mirrors getChecklistTasksForRole's own gate: ADMIN sees every checklist
  // task, everyone else only the ones marked TEAM-visible — an OWNER_ONLY
  // task must never show as an overdue item to a manager.
  isAdmin: boolean;
  // Lead follow-ups are Sales data — same Sales department-access check the
  // Home page already uses to gate its Sales KPI section.
  hasSalesAccess: boolean;
  // Pending (unsigned) payroll — matches middleware.ts's own /staff gate
  // (ADMIN or SERVICE_MANAGER), since that's who can already open the full
  // /staff/payroll page. Pass isAdminOrServiceManager(session.role).
  canViewPayroll: boolean;
}

// Read-only "what's on deck today" card for the Home page — none of the
// existing getHrTodayAttentionItems counts cover any of these four (that
// helper is pure counts-by-area, not today-scoped), so each is its own
// small query here rather than bending that one to fit. Gated the same way
// the Home page itself gates the Financials and Sales sections — each
// section is scoped at the query level, never fetched then hidden, so a
// manager's response never contains payroll or admin-only task data in the
// first place.
export async function getTodayCardData(
  access: TodayCardAccess,
  now: Date = new Date()
): Promise<TodayCardData> {
  const { start, end } = businessDayRangeUtc(now);
  const { isAdmin, hasSalesAccess, canViewPayroll } = access;

  const [interviews, followUps, checklistTasks, pendingPayrollEntries] = await Promise.all([
    prisma.applicant.findMany({
      where: {
        stage: { in: SCHEDULING_STAGES },
        scheduledAt: { gte: start, lt: end },
      },
      select: { id: true, firstName: true, lastName: true, stage: true, scheduledAt: true },
      orderBy: { scheduledAt: "asc" },
    }),
    hasSalesAccess
      ? prisma.lead.findMany({
          where: {
            stage: { notIn: ["WON", "LOST"] },
            followUpDueAt: { gte: start, lt: end },
          },
          select: { id: true, firstName: true, lastName: true, followUpDueAt: true },
          orderBy: { followUpDueAt: "asc" },
        })
      : Promise.resolve([]),
    prisma.checklistTask.findMany({
      where: isAdmin ? undefined : { visibility: "TEAM" },
      select: { id: true, task: true, frequency: true, status: true, updatedAt: true, targetDate: true, dueFridayOfWeek: true },
    }),
    canViewPayroll
      ? prisma.payrollEntry.findMany({
          where: { status: "PENDING" },
          select: { id: true, employee: { select: { name: true } }, payPeriod: { select: { label: true } } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const overdueTasks: TodayOverdueTask[] = checklistTasks
    .map((t) => ({ ...t, effectiveStatus: effectiveChecklistStatus(t, now) }))
    .filter((t) => getDueStatus(t, now) === "OVERDUE")
    .map((t) => ({
      id: t.id,
      task: t.task,
      targetDate: t.targetDate ? t.targetDate.toISOString() : null,
    }));

  return {
    interviews: interviews.map((a) => ({
      applicantId: a.id,
      name: `${a.firstName} ${a.lastName}`,
      stage: a.stage,
      scheduledAt: a.scheduledAt!.toISOString(),
    })),
    followUpsDue: followUps.map((l) => ({
      leadId: l.id,
      name: `${l.firstName} ${l.lastName}`,
      followUpDueAt: l.followUpDueAt!.toISOString(),
    })),
    overdueTasks,
    pendingPayroll: pendingPayrollEntries.map((p) => ({
      entryId: p.id,
      employeeName: p.employee.name,
      payPeriodLabel: p.payPeriod.label,
    })),
  };
}
