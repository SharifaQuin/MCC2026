import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadEmployeeDetail, EmployeeDetailView } from "@/components/EmployeeDetail";
import { getAssignedTraineeIds } from "@/lib/trainingAssignment";

export default async function TrainerEmployeeDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // A Trainer can only open the profile of a trainee assigned to them —
  // ADMIN and SERVICE_MANAGER (who can also reach this route) can open
  // anyone's, same as on /admin/employees.
  if (session.role === "TRAINER") {
    const assignedIds = await getAssignedTraineeIds(session.sub);
    if (!assignedIds.includes(params.id)) notFound();
  }

  const data = await loadEmployeeDetail(params.id);
  if (!data) notFound();
  return <EmployeeDetailView data={data} viewerRole="TRAINER" />;
}
