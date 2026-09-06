import { loadEmployeeSummaries } from "@/components/EmployeeList";
import { EmployeeListView } from "@/components/EmployeeListView";

export default async function TrainerEmployeesPage() {
  const data = await loadEmployeeSummaries();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Employees</h1>
      <EmployeeListView data={data} basePath="/trainer/employees" />
    </div>
  );
}
