import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { COMPLAINT_WINDOW_DAYS } from "@/lib/hr";

export const STAFF_ROLES: Role[] = ["TRAINEE", "TRAINER", "SERVICE_MANAGER"];

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
    select: { id: true, employeeId: true, name: true, email: true, role: true, hireDate: true },
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
    employeeId: s.employeeId,
    name: s.name,
    email: s.email,
    role: s.role,
    hireDate: s.hireDate,
    validComplaintCount: complaintCounts.get(s.id) ?? 0,
    hasPayrollDispute: disputedIds.has(s.id),
  }));
}

// Departed employees are anyone with lastDay set (see Roster Status), not
// limited to STAFF_ROLES — turnover should count anyone who left, including
// a departed ADMIN/manager — but the headcount denominator stays STAFF_ROLES
// since that's the population the rest of this dashboard tracks.
export async function getTurnoverStats(windowDays = 90) {
  const now = new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const [headcountNow, departedRows] = await Promise.all([
    prisma.user.count({ where: { role: { in: STAFF_ROLES }, active: true } }),
    prisma.user.findMany({
      where: { lastDay: { gte: since, lte: now } },
      select: { id: true, name: true, lastDay: true, hireDate: true, departureReason: true },
      orderBy: { lastDay: "desc" },
    }),
  ]);

  const departures = departedRows.length;
  // No historical headcount snapshots exist, so approximate headcount at the
  // start of the window as "who's still here now, plus who left during it" —
  // a reasonable stand-in for a proper time series.
  const headcountAtStart = headcountNow + departures;
  const turnoverRatePct =
    headcountAtStart > 0 ? Math.round((departures / headcountAtStart) * 1000) / 10 : 0;

  const tenuresAtDeparture = departedRows
    .filter((d) => d.hireDate)
    .map((d) => (d.lastDay!.getTime() - d.hireDate!.getTime()) / (1000 * 60 * 60 * 24));
  const avgTenureDays =
    tenuresAtDeparture.length > 0
      ? Math.round(tenuresAtDeparture.reduce((sum, t) => sum + t, 0) / tenuresAtDeparture.length)
      : null;

  return {
    windowDays,
    headcountNow,
    departures,
    turnoverRatePct,
    avgTenureDays,
    recentDepartures: departedRows.map((d) => ({
      id: d.id,
      name: d.name,
      lastDay: d.lastDay as Date,
      departureReason: d.departureReason,
      tenureDays: d.hireDate ? Math.round((d.lastDay!.getTime() - d.hireDate.getTime()) / (1000 * 60 * 60 * 24)) : null,
    })),
  };
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
