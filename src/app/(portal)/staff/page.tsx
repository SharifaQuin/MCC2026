import Link from "next/link";
import { getStaffDashboardStats, getStaffDirectory, yearsOfService } from "@/lib/staff";

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
  const [stats, directory] = await Promise.all([getStaffDashboardStats(), getStaffDirectory()]);

  return (
    <div className="space-y-8">
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
        <h2 className="mb-3 text-lg font-medium">Staff Directory</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Name</th>
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
