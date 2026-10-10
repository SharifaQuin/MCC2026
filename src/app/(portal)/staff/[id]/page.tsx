import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadEmployeeDetail, EmployeeDetailView } from "@/components/EmployeeDetail";
import OfficeAssistantEmployeeDetail from "@/components/OfficeAssistantEmployeeDetail";
import { getOfficeAssistantEmployeeDetail } from "@/lib/officeAssistantStaff";
import { getSession } from "@/lib/session";
import { getAreaAccessForUser } from "@/lib/officeAssistant";

export default async function StaffProfilePage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role === "OFFICE_ASSISTANT") {
    const access = await getAreaAccessForUser(session.sub, "STAFF_DIRECTORY");
    if (!access.canView) redirect("/");
    const trainingAccess = await getAreaAccessForUser(session.sub, "TRAINING");
    const data = await getOfficeAssistantEmployeeDetail(params.id);
    if (!data) notFound();
    return (
      <div>
        <Link href="/staff" className="mb-4 inline-block text-sm text-brand-700 hover:underline">
          ← Back to Staff Directory
        </Link>
        <OfficeAssistantEmployeeDetail data={data} canEditTraining={trainingAccess.canEdit} />
      </div>
    );
  }

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
