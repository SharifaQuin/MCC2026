import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasDepartmentAccess } from "@/lib/departments";
import { loadAdminDashboard } from "@/lib/dashboard";
import { loadRecruitingDashboard } from "@/lib/recruiting";
import { loadSalesDashboard } from "@/lib/salesDashboard";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-neutral-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default async function HROverviewPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER") redirect("/");

  const grants = await prisma.departmentAccess.findMany({
    where: { userId: session.sub },
    select: { department: true, canEdit: true },
  });
  const hasSalesAccess = hasDepartmentAccess(session.role, grants, "SALES").canView;

  const [training, recruiting, sales] = await Promise.all([
    loadAdminDashboard(),
    loadRecruitingDashboard(),
    hasSalesAccess ? loadSalesDashboard() : Promise.resolve(null),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">HR</h1>

      {sales && (
        <section className="mb-6 rounded-lg border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-neutral-900">Sales</h2>
            {sales.goal > 0 && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  sales.revenueTowardGoal >= sales.goal
                    ? "bg-green-100 text-green-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {sales.revenueTowardGoal >= sales.goal
                  ? "Goal hit this month! 🎉"
                  : `${money(sales.revenueRemaining)} to hit this month's goal`}
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
            <Stat
              label={sales.actuals.entered ? "Actual Revenue" : "Won This Month"}
              value={money(sales.revenueTowardGoal)}
            />
            <Stat label="Monthly Goal" value={sales.goal > 0 ? money(sales.goal) : "Not set"} />
            <Stat
              label="Cleanings Needed"
              value={
                sales.goal > 0 && sales.revenueTowardGoal < sales.goal
                  ? String(sales.cleaningsNeeded)
                  : "0"
              }
            />
            <Stat label="Profit So Far" value={sales.actuals.entered ? money(sales.actuals.profit) : "—"} />
            <Stat label="Pending Quotes" value={sales.pendingCount} />
            <Stat
              label="Win Rate"
              value={sales.winRate === null ? "—" : `${Math.round(sales.winRate * 100)}%`}
            />
          </div>
          <Link href="/sales" className="mt-5 inline-block text-sm text-brand-700 hover:underline">
            View full Sales dashboard →
          </Link>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">Training</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Onboarding, modules, certification, and field evaluations.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Total Employees" value={training.totalEmployees} />
            <Stat label="In Training" value={training.inTraining} />
            <Stat label="Completed All Training" value={training.completedAll} />
            <Stat label="Pending Certification" value={training.pendingCertifications.length} />
          </div>
          <Link
            href="/admin"
            className="mt-5 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            View Training Dashboard
          </Link>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">Recruiting</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Job postings, applicants, and the hiring pipeline.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Active Applicants" value={recruiting.active} />
            <Stat label="Interviews Scheduled" value={recruiting.scheduledInterviews} />
            <Stat label="Awaiting Scheduling" value={recruiting.awaitingScheduling} />
            <Stat label="Hired" value={recruiting.hired} />
          </div>
          <Link
            href="/recruiting"
            className="mt-5 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            View Recruiting Pipeline
          </Link>
        </section>
      </div>
    </div>
  );
}
