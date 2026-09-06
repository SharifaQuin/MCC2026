import Link from "next/link";
import { loadEmployeeSummaries } from "@/components/EmployeeList";
import { EmployeeListView } from "@/components/EmployeeListView";

export default async function AdminEmployeesPage() {
  const data = await loadEmployeeSummaries();
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Employees</h1>
        <div className="flex gap-3">
          <a
            href="/api/admin/employees/export"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Export CSV
          </a>
          <Link
            href="/admin/invite"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Invite Employee
          </Link>
        </div>
      </div>
      <EmployeeListView data={data} basePath="/admin/employees" />
    </div>
  );
}
