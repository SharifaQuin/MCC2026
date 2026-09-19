import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadEmployeeSummaries } from "@/components/EmployeeList";
import { EmployeeListView, type StatusFilter } from "@/components/EmployeeListView";
import { getAssignedTraineeIds } from "@/lib/trainingAssignment";

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
  const session = await getSession();
  if (!session) redirect("/login");

  const rawData = await loadEmployeeSummaries();

  // A Trainer only sees the trainees personally assigned to them — ADMIN
  // and SERVICE_MANAGER (who can also reach this route) see everyone,
  // same as they do on /admin/employees.
  let data = rawData;
  if (session.role === "TRAINER") {
    const assignedIds = new Set(await getAssignedTraineeIds(session.sub));
    data = { ...rawData, users: rawData.users.filter((u) => assignedIds.has(u.id)) };
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Employees</h1>
      <EmployeeListView
        data={data}
        basePath="/trainer/employees"
        initialStatus={
          VALID_STATUSES.includes(searchParams.status ?? "") ? (searchParams.status as StatusFilter) : undefined
        }
        showDeparted={false}
      />
    </div>
  );
}
