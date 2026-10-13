import Link from "next/link";
import { getOfficeAssistantStaffDirectory } from "@/lib/officeAssistantStaff";

// Deliberately separate from the admin Staff Dashboard — no complaints,
// payroll, turnover, or Add Employee panel ever render here, and the data
// loader behind this never queries that data in the first place.
export default async function OfficeAssistantStaffDirectory() {
  const directory = await getOfficeAssistantStaffDirectory();

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Employee ID</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Office / Crew</th>
            <th className="px-4 py-3">Supervisor</th>
            <th className="px-4 py-3">Milestones Completed</th>
          </tr>
        </thead>
        <tbody>
          {directory.map((s) => (
            <tr key={s.id} className="border-b border-neutral-100 last:border-0">
              <td className="px-4 py-3">
                <Link href={`/staff/${s.id}`} className="font-medium text-brand-700 hover:underline">
                  {s.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-neutral-600">{s.employeeId ?? "—"}</td>
              <td className="px-4 py-3 text-neutral-600">{s.roleLabel}</td>
              <td className="px-4 py-3 text-neutral-600">
                {[s.officeLocation, s.crewType].filter(Boolean).join(" / ") || "—"}
              </td>
              <td className="px-4 py-3 text-neutral-600">{s.supervisorName ?? "—"}</td>
              <td className="px-4 py-3 text-neutral-600">{s.milestonesCompleted}</td>
            </tr>
          ))}
          {directory.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                No staff yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
