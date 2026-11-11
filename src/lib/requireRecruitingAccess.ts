import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { getAreaAccessForUser, isAreaGrantRole } from "@/lib/officeAssistant";

// Recruiting lives under the HR department but holds sensitive applicant
// PII, so on top of HR view access it's restricted to the roles that already
// manage employees elsewhere in the app — plus, narrowly, an Office
// Assistant or a Sales Rep individually granted the RECRUITING area. Either
// grant-based role's edit rights here come from their own RECRUITING area
// grant, never from HR department access (which SERVICE_MANAGER gets
// broadly and neither of these roles inherits — see resolveUserDepartments
// in src/lib/departments.ts, which permanently excludes HR from a Sales
// Rep's whole-department access) — see src/lib/officeAssistant.ts.
//
// The grant-based check runs BEFORE requireDepartmentAccess("HR") below,
// not after: a Sales Rep's resolveUserDepartments never includes HR at
// all, so calling requireDepartmentAccess("HR") first would redirect her
// away before her own RECRUITING grant was ever consulted.
//
// This only governs whether the *page* lets the viewer in and whether its
// composer-style actions (send email/text, add note) are reachable at all.
// The much narrower rule for which *applicant stage transitions* a
// grant-based editor may make lives separately in
// src/app/(portal)/recruiting/applicants/actions.ts
// (routineStageTransitionError) — canEdit here does not imply the ability
// to move an applicant to a final hiring stage.
export async function requireRecruitingAccess() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (isAreaGrantRole(session.role)) {
    const recruitingAccess = await getAreaAccessForUser(session.sub, "RECRUITING");
    if (!recruitingAccess.canView) redirect("/");
    return { session, canEdit: recruitingAccess.canEdit };
  }

  const { canEdit } = await requireDepartmentAccess("HR");
  if (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER") redirect("/");
  return { session, canEdit };
}
