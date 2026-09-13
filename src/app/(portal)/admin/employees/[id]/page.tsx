import Link from "next/link";
import { notFound } from "next/navigation";
import { loadEmployeeDetail, EmployeeDetailView } from "@/components/EmployeeDetail";
import { getSession } from "@/lib/session";

export default async function AdminEmployeeDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  const data = await loadEmployeeDetail(params.id);
  if (!data) notFound();
  return (
    <div>
      <Link
        href={`/staff/${params.id}`}
        className="mb-4 inline-block text-sm text-brand-700 hover:underline"
      >
        View Full Staff Profile (complaints, attendance, payroll, account) →
      </Link>
      <EmployeeDetailView
        data={data}
        viewerRole={session?.role === "SERVICE_MANAGER" ? "SERVICE_MANAGER" : "ADMIN"}
      />
    </div>
  );
}
