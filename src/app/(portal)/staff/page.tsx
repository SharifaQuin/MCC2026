import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getStaffDashboardStats, getStaffDirectory, getTurnoverStats, yearsOfService } from "@/lib/staff";
import { getAreaAccessForUser } from "@/lib/officeAssistant";
import { getActingAsCandidates, ROLE_LABELS as ACTING_AS_ROLE_LABELS } from "@/lib/impersonation";
import { actAsStaffMemberAction } from "./actingAsActions";
import AddEmployeePanel from "@/components/AddEmployeePanel";
import OfficeAssistantStaffDirectory from "@/components/OfficeAssistantStaffDirectory";

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "good" | "warn";
}) {
  const toneClass =
    tone === "good" ? "text-green-700" : tone === "warn" ? "text-amber-700" : "text-neutral-900";
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  TRAINEE: "Technician",
  TRAINER: "Trainer",
  SERVICE_MANAGER: "Service Manager",
};

export default async function StaffDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "OFFICE_ASSISTANT") {
    const access = await getAreaAccessForUser(session.sub, "STAFF_DIRECTORY");
    if (!access.canView) redirect("/");
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Staff Directory</h1>
        <OfficeAssistantStaffDirectory />
      </div>
    );
  }

  const [stats, directory, turnover, actingAsCandidates] = await Promise.all([
    getStaffDashboardStats(),
    getStaffDirectory(),
    getTurnoverStats(90),
    session.role === "ADMIN" ? getActingAsCandidates() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      {session.role === "ADMIN" && actingAsCandidates.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-1 text-lg font-medium">View / Act As</h2>
          <p className="mb-4 text-sm text-neutral-500">
            See and use the dashboard exactly as one of these real employees would, with their own
            effective permissions — not read-only. A banner stays on screen with a one-click way
            back to your own owner view. Most actions you take record you, the Owner, not the
            employee — a few are blocked outright instead: signing a document, signing payroll
            hours, and changing a password, since those can only honestly be the employee&apos;s own
            act.
          </p>
          <div className="space-y-2">
            {actingAsCandidates.map((candidate) => (
              <div
                key={candidate.id}
                data-testid={`act-as-row-${candidate.id}`}
                className="flex items-center justify-between rounded-md border border-neutral-100 bg-neutral-50 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900">{candidate.name}</p>
                  <p className="text-xs text-neutral-500">
                    {ACTING_AS_ROLE_LABELS[candidate.role]} · {candidate.email}
                  </p>
                </div>
                <form action={actAsStaffMemberAction.bind(null, candidate.id)}>
                  <button className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                    Act As
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total Staff" value={stats.totalStaff} />
        <Stat
          label="Upcoming Anniversaries (30d)"
          value={stats.upcomingAnniversaries.length}
          tone={stats.upcomingAnniversaries.length > 0 ? "good" : "neutral"}
        />
        <Stat
          label="Open Complaints"
          value={stats.openComplaints}
          tone={stats.openComplaints > 0 ? "warn" : "neutral"}
        />
        <Stat
          label="Payroll Disputes"
          value={stats.payrollDisputes}
          tone={stats.payrollDisputes > 0 ? "warn" : "neutral"}
        />
      </div>

      {stats.upcomingAnniversaries.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-5">
          <p className="mb-3 font-medium text-green-800">Upcoming work anniversaries</p>
          <ul className="space-y-2">
            {stats.upcomingAnniversaries.map((a) => (
              <li key={a.id} className="text-sm">
                <Link
                  href={`/staff/${a.id}`}
                  className="font-medium text-green-900 underline hover:no-underline"
                >
                  {a.name}
                </Link>
                <span className="ml-2 text-xs text-green-700">
                  {a.yearsCompleting} year{a.yearsCompleting === 1 ? "" : "s"} on{" "}
                  {a.anniversaryDate.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-medium">Turnover &amp; Retention (last 90 days)</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Departures" value={turnover.departures} tone={turnover.departures > 0 ? "warn" : "neutral"} />
          <Stat
            label="Turnover Rate"
            value={`${turnover.turnoverRatePct}%`}
            tone={turnover.turnoverRatePct > 10 ? "warn" : "neutral"}
          />
          <Stat
            label="Avg. Tenure at Departure"
            value={turnover.avgTenureDays !== null ? `${Math.round(turnover.avgTenureDays / 30)} mo` : "—"}
          />
        </div>
        {turnover.recentDepartures.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Last Day</th>
                  <th className="px-4 py-3">Tenure</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {turnover.recentDepartures.map((d) => (
                  <tr key={d.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/staff/${d.id}`} className="font-medium text-brand-700 hover:underline">
                        {d.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{d.lastDay.toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-neutral-600">
                      {d.tenureDays !== null ? `${Math.round(d.tenureDays / 30)} mo` : "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{d.departureReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Staff Directory</h2>
          <Link href="/staff/departed" className="text-sm font-medium text-brand-700 hover:underline">
            View All Departed Employees →
          </Link>
        </div>
        <div className="mb-4">
          <AddEmployeePanel />
        </div>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Employee ID</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Years of Service</th>
                <th className="px-4 py-3">Flags</th>
              </tr>
            </thead>
            <tbody>
              {directory.map((s) => (
                <tr key={s.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/staff/${s.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {s.name}
                    </Link>
                    <p className="text-xs text-neutral-500">{s.email}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{s.employeeId ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-600">{ROLE_LABELS[s.role] ?? s.role}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {s.hireDate ? yearsOfService(new Date(s.hireDate)) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {s.validComplaintCount >= 3 && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          {s.validComplaintCount} complaints
                        </span>
                      )}
                      {s.hasPayrollDispute && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Payroll question
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {directory.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                    No staff yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
