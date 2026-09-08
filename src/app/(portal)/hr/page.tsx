import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadAdminDashboard } from "@/lib/dashboard";
import { loadRecruitingDashboard } from "@/lib/recruiting";

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

  const [training, recruiting] = await Promise.all([
    loadAdminDashboard(),
    loadRecruitingDashboard(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">HR</h1>
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
