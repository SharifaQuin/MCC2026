import Link from "next/link";
import { getAllDepartedEmployees } from "@/lib/staff";

const ROLE_LABELS: Record<string, string> = {
  TRAINEE: "Technician",
  TRAINER: "Trainer",
  SERVICE_MANAGER: "Service Manager",
  ADMIN: "Admin",
};

export default async function DepartedEmployeesPage() {
  const departed = await getAllDepartedEmployees();

  return (
    <div>
      <Link href="/staff" className="mb-4 inline-block text-sm text-brand-700 hover:underline">
        ← Back to Staff Directory
      </Link>
      <h1 className="mb-2 text-2xl font-semibold">Departed Employees</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Every employee marked Departed, any role, regardless of when they left — the Staff
        Directory only shows active people and the Turnover view only covers the last 90 days.
      </p>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Last Day</th>
              <th className="px-4 py-3">Tenure</th>
              <th className="px-4 py-3">Rehire Eligible</th>
              <th className="px-4 py-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {departed.map((d) => (
              <tr key={d.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/staff/${d.id}`} className="font-medium text-brand-700 hover:underline">
                    {d.name}
                  </Link>
                  <p className="text-xs text-neutral-500">
                    {d.email}
                    {d.employeeId && <span className="ml-2 text-neutral-400">· {d.employeeId}</span>}
                  </p>
                </td>
                <td className="px-4 py-3 text-neutral-600">{ROLE_LABELS[d.role] ?? d.role}</td>
                <td className="px-4 py-3 text-neutral-600">{new Date(d.lastDay!).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {d.tenureDays !== null ? `${Math.round(d.tenureDays / 30)} mo` : "—"}
                </td>
                <td className="px-4 py-3">
                  {d.rehireEligible === true ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Yes
                    </span>
                  ) : d.rehireEligible === false ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      No
                    </span>
                  ) : (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                      Not determined
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-600">{d.departureReason ?? "—"}</td>
              </tr>
            ))}
            {departed.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  No departed employees on file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
