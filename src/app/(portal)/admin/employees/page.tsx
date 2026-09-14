import Link from "next/link";
import { loadEmployeeSummaries } from "@/components/EmployeeList";
import { EmployeeListView, type StatusFilter } from "@/components/EmployeeListView";

const VALID_STATUSES: string[] = [
  "ALL",
  "ACTIVE",
  "INVITE_PENDING",
  "PENDING_CERT",
  "CERTIFIED",
  "COMPLETED_ALL",
  "DEACTIVATED",
];

export default async function AdminEmployeesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const data = await loadEmployeeSummaries();
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Employees</h1>
        <a
          href="/api/admin/employees/export"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Export CSV
        </a>
      </div>
      <p className="mb-6 text-sm text-neutral-500">
        To add a new employee, use{" "}
        <Link href="/staff" className="text-brand-700 hover:underline">
          Staff → + Add Employee
        </Link>
        .
      </p>
      <EmployeeListView
        data={data}
        basePath="/admin/employees"
        initialStatus={
          VALID_STATUSES.includes(searchParams.status ?? "") ? (searchParams.status as StatusFilter) : undefined
        }
      />
    </div>
  );
}
