import Link from "next/link";
import { notFound } from "next/navigation";
import { loadEmployeeDetail, EmployeeDetailView } from "@/components/EmployeeDetail";
import { getSession } from "@/lib/session";

export default async function StaffProfilePage({ params }: { params: { id: string } }) {
  const session = await getSession();
  const data = await loadEmployeeDetail(params.id);
  if (!data) notFound();

  return (
    <div>
      <Link href="/staff" className="mb-4 inline-block text-sm text-brand-700 hover:underline">
        ← Back to Staff Directory
      </Link>
      <EmployeeDetailView
        data={data}
        canManageAccount
        showHrTools
        viewerRole={session?.role === "SERVICE_MANAGER" ? "SERVICE_MANAGER" : "ADMIN"}
      />
    </div>
  );
}
