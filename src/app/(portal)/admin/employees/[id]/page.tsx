import { notFound } from "next/navigation";
import { loadEmployeeDetail, EmployeeDetailView } from "@/components/EmployeeDetail";
import { getSession } from "@/lib/session";

export default async function AdminEmployeeDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  const data = await loadEmployeeDetail(params.id);
  if (!data) notFound();
  return (
    <EmployeeDetailView
      data={data}
      canManageAccount
      viewerRole={session?.role === "SERVICE_MANAGER" ? "SERVICE_MANAGER" : "ADMIN"}
    />
  );
}
