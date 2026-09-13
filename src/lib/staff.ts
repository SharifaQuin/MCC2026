import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { COMPLAINT_WINDOW_DAYS } from "@/lib/hr";

const STAFF_ROLES: Role[] = ["TRAINEE", "TRAINER", "SERVICE_MANAGER"];

function nextAnniversary(hireDate: Date, from: Date): Date {
  const next = new Date(from.getFullYear(), hireDate.getMonth(), hireDate.getDate());
  if (next < from) next.setFullYear(next.getFullYear() + 1);
  return next;
}

export async function getUpcomingAnniversaries(days = 30) {
  const staff = await prisma.user.findMany({
    where: { role: { in: STAFF_ROLES }, active: true, hireDate: { not: null } },
    select: { id: true, name: true, hireDate: true },
  });

  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return staff
    .map((s) => {
      const hireDate = s.hireDate as Date;
      const anniversaryDate = nextAnniversary(hireDate, now);
      const yearsCompleting = anniversaryDate.getFullYear() - hireDate.getFullYear();
      return { id: s.id, name: s.name, hireDate, anniversaryDate, yearsCompleting };
    })
    .filter((s) => s.anniversaryDate <= cutoff)
    .sort((a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime());
}

export function yearsOfService(hireDate: Date, from = new Date()): number {
  let years = from.getFullYear() - hireDate.getFullYear();
  const anniversaryPassedThisYear =
    from.getMonth() > hireDate.getMonth() ||
    (from.getMonth() === hireDate.getMonth() && from.getDate() >= hireDate.getDate());
  if (!anniversaryPassedThisYear) years -= 1;
  return Math.max(0, years);
}

export async function getStaffDirectory() {
  const staff = await prisma.user.findMany({
    where: { role: { in: STAFF_ROLES }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, hireDate: true },
  });

  const since = new Date(Date.now() - COMPLAINT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [validComplaints, disputedPayroll] = await Promise.all([
    prisma.complaint.findMany({
      where: { status: "VALID", createdAt: { gte: since } },
      select: { employeeId: true },
    }),
    prisma.payrollEntry.findMany({ where: { status: "DISPUTED" }, select: { employeeId: true } }),
  ]);
  const complaintCounts = new Map<string, number>();
  for (const c of validComplaints) {
    complaintCounts.set(c.employeeId, (complaintCounts.get(c.employeeId) ?? 0) + 1);
  }
  const disputedIds = new Set(disputedPayroll.map((d) => d.employeeId));

  return staff.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    role: s.role,
    hireDate: s.hireDate,
    validComplaintCount: complaintCounts.get(s.id) ?? 0,
    hasPayrollDispute: disputedIds.has(s.id),
  }));
}

export async function getStaffDashboardStats() {
  const [totalStaff, upcomingAnniversaries, openComplaints, payrollDisputes] = await Promise.all([
    prisma.user.count({ where: { role: { in: STAFF_ROLES }, active: true } }),
    getUpcomingAnniversaries(30),
    prisma.complaint.count({ where: { status: "OPEN" } }),
    prisma.payrollEntry.count({ where: { status: "DISPUTED" } }),
  ]);

  return {
    totalStaff,
    upcomingAnniversaries,
    openComplaints,
    payrollDisputes,
  };
}
