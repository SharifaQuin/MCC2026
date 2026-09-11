import { prisma } from "@/lib/prisma";

// Matches the "4 valid complaints within 60 days" disciplinary threshold
// described in the Workplace Conduct training module. This only counts
// complaints HR has already reviewed and marked VALID — OPEN ones (not yet
// reviewed) and DISMISSED ones don't count.
export const COMPLAINT_WINDOW_DAYS = 60;
export const COMPLAINT_TERMINATION_THRESHOLD = 4;

export async function getValidComplaintCount(employeeId: string, days = COMPLAINT_WINDOW_DAYS) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.complaint.count({
    where: { employeeId, status: "VALID", createdAt: { gte: since } },
  });
}

// Employees at or approaching the valid-complaint threshold, for the admin
// dashboard — a heads-up, not an automatic action.
export async function getComplaintDashboardFlags() {
  const since = new Date(Date.now() - COMPLAINT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const validComplaints = await prisma.complaint.findMany({
    where: { status: "VALID", createdAt: { gte: since } },
    select: { employeeId: true },
  });
  const counts = new Map<string, number>();
  for (const c of validComplaints) {
    counts.set(c.employeeId, (counts.get(c.employeeId) ?? 0) + 1);
  }

  const atRiskIds = [...counts.entries()].filter(([, count]) => count >= 3).map(([id]) => id);
  if (atRiskIds.length === 0) return [];

  const employees = await prisma.user.findMany({
    where: { id: { in: atRiskIds } },
    select: { id: true, name: true },
  });

  return employees
    .map((e) => ({ id: e.id, name: e.name, validComplaintCount: counts.get(e.id) ?? 0 }))
    .sort((a, b) => b.validComplaintCount - a.validComplaintCount);
}
