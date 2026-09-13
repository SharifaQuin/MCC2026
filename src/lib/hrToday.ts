import { prisma } from "@/lib/prisma";
import { STAFF_ROLES } from "@/lib/staff";
import { buildMilestoneTimeline } from "@/lib/milestones";
import { NEEDS_DECISION_STAGES } from "@/lib/recruiting";

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
  ] = await Promise.all([
    prisma.user.count({ where: { role: "TRAINEE", certificationStatus: "PENDING" } }),
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
      where: { role: { in: STAFF_ROLES }, active: true, hireDate: { not: null } },
      select: { id: true, hireDate: true, milestoneReviews: true },
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
  ];

  return items.filter((item) => item.count > 0);
}
