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

export default async function TrainerEmployeesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const data = await loadEmployeeSummaries();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Employees</h1>
      <EmployeeListView
        data={data}
        basePath="/trainer/employees"
        initialStatus={
          VALID_STATUSES.includes(searchParams.status ?? "") ? (searchParams.status as StatusFilter) : undefined
        }
      />
    </div>
  );
}
