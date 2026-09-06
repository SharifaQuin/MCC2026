import Link from "next/link";
import { loadAdminDashboard } from "@/lib/dashboard";

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-green-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-neutral-900";

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const stats = await loadAdminDashboard();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-3">
          <Link
            href="/admin/invite"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Invite Employee
          </Link>
          <Link
            href="/admin/employees"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            View All Employees
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Employees" value={stats.totalEmployees} />
        <StatCard label="Invite Pending" value={stats.pendingInvites} tone="warn" />
        <StatCard label="Not Started" value={stats.notStarted} />
        <StatCard label="In Training" value={stats.inTraining} />
        <StatCard label="Completed All Training" value={stats.completedAll} tone="good" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Pending Certification Review"
          value={stats.pendingCertifications.length}
          tone={stats.pendingCertifications.length > 0 ? "warn" : "neutral"}
        />
        <StatCard label="Certified Technicians" value={stats.certifiedCount} tone="good" />
        <StatCard
          label="Avg. Days to Certification"
          value={stats.avgDaysToCertify !== null ? stats.avgDaysToCertify : "—"}
        />
        <StatCard label="Field Evaluations (Last 30 Days)" value={stats.recentEvaluations} />
        <StatCard label="Deactivated Accounts" value={stats.deactivated} />
      </div>

      {stats.pendingCertifications.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <p className="mb-3 font-medium text-amber-800">
            Awaiting your certification review
          </p>
          <ul className="space-y-2">
            {stats.pendingCertifications.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/employees/${p.id}`}
                  className="text-sm font-medium text-amber-900 underline hover:no-underline"
                >
                  {p.name}
                </Link>
                {p.certRecommendedAt && (
                  <span className="ml-2 text-xs text-amber-700">
                    recommended {new Date(p.certRecommendedAt).toLocaleDateString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.stalledEmployees.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <p className="mb-3 font-medium text-neutral-700">
            Needs a nudge (no activity in 7+ days, or never logged in)
          </p>
          <ul className="space-y-2">
            {stats.stalledEmployees.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/admin/employees/${s.id}`}
                  className="text-sm font-medium text-neutral-800 underline hover:no-underline"
                >
                  {s.name}
                </Link>
                <span className="ml-2 text-xs text-neutral-500">
                  {s.lastLoginAt
                    ? `last active ${new Date(s.lastLoginAt).toLocaleDateString()}`
                    : "never logged in"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.orgFocusAreas.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <p className="mb-2 font-medium text-amber-800">
            Company-wide focus areas (average field evaluation score below 3/5 across all
            employees)
          </p>
          <ul className="space-y-1 text-sm text-amber-800">
            {stats.orgFocusAreas.map((f) => (
              <li key={f.key}>
                <span className="font-medium">{f.label}</span> — avg {f.average}/5 across{" "}
                {f.entryCount} evaluation{f.entryCount === 1 ? "" : "s"}. Related modules:{" "}
                {f.relatedModuleTitles.join(", ")}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700">
            This might be worth addressing as a group training topic rather than
            employee-by-employee.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-neutral-300 p-5 text-sm text-neutral-500">
        Coming in a later version: work anniversaries, start dates, and other HR data on this
        dashboard.
      </div>
    </div>
  );
}
