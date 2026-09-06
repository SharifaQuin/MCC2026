import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import ComingSoonDepartment from "@/components/ComingSoonDepartment";

export default async function OperationsPage() {
  const { canEdit } = await requireDepartmentAccess("OPERATIONS");
  return <ComingSoonDepartment title="Operations" canEdit={canEdit} />;
}
