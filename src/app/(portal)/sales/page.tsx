import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import ComingSoonDepartment from "@/components/ComingSoonDepartment";

export default async function SalesPage() {
  const { canEdit } = await requireDepartmentAccess("SALES");
  return <ComingSoonDepartment title="Sales" canEdit={canEdit} />;
}
