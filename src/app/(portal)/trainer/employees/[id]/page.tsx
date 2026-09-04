import { notFound } from "next/navigation";
import { loadEmployeeDetail, EmployeeDetailView } from "@/components/EmployeeDetail";

export default async function TrainerEmployeeDetailPage({ params }: { params: { id: string } }) {
  const data = await loadEmployeeDetail(params.id);
  if (!data) notFound();
  return <EmployeeDetailView data={data} />;
}
