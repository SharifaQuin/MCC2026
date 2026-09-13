import { redirect } from "next/navigation";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";

// Recruiting lives under the HR department but holds sensitive applicant
// PII, so on top of HR view access it's restricted to the roles that already
// manage employees elsewhere in the app.
export async function requireRecruitingAccess() {
  const { session, canEdit } = await requireDepartmentAccess("HR");
  if (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER") redirect("/");
  return { session, canEdit };
}
