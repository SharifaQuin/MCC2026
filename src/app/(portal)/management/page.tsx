import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import ComingSoonDepartment from "@/components/ComingSoonDepartment";

export default async function ManagementPage() {
  const { canEdit } = await requireDepartmentAccess("MANAGEMENT");
  return <ComingSoonDepartment title="Management" canEdit={canEdit} />;
}
