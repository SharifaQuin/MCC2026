import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadAdminDashboard } from "@/lib/dashboard";
import { loadRecruitingDashboard } from "@/lib/recruiting";
import { getStaffDashboardStats } from "@/lib/staff";
import { getHrTodayAttentionItems } from "@/lib/hrToday";
import SendHrDigestButton from "@/components/SendHrDigestButton";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-neutral-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

export default async function HROverviewPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER") redirect("/");

  const [training, recruiting, staff, attentionItems] = await Promise.all([
    loadAdminDashboard(),
    loadRecruitingDashboard(),
    getStaffDashboardStats(),
    getHrTodayAttentionItems(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">HR</h1>

      {attentionItems.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-medium text-amber-900">Needs Attention Today</p>
            {session.role === "ADMIN" && <SendHrDigestButton />}
          </div>
          <div className="flex flex-wrap gap-2">
            {attentionItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`rounded-full px-3 py-1.5 text-sm font-medium hover:underline ${
                  item.tone === "bad" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {item.label} ({item.count})
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
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

        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">Staff</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Complaints, attendance, payroll, and anniversaries.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Total Staff" value={staff.totalStaff} />
            <Stat label="Upcoming Anniversaries" value={staff.upcomingAnniversaries.length} />
            <Stat label="Open Complaints" value={staff.openComplaints} />
            <Stat label="Payroll Disputes" value={staff.payrollDisputes} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/staff"
              className="inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              View Staff Dashboard
            </Link>
            {session.role === "ADMIN" && (
              <Link href="/staff/document-templates" className="text-sm font-medium text-brand-700 hover:underline">
                Manage Document Templates →
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
