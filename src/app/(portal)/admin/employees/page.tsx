import Link from "next/link";
import { loadEmployeeSummaries, EmployeeListView } from "@/components/EmployeeList";

export default async function AdminEmployeesPage() {
  const data = await loadEmployeeSummaries();
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Employees</h1>
        <Link
          href="/admin/invite"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Invite Employee
        </Link>
      </div>
      <EmployeeListView data={data} basePath="/admin/employees" />
    </div>
  );
}
