import { redirect } from "next/navigation";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { getAreaAccessForUser } from "@/lib/officeAssistant";

// Recruiting lives under the HR department but holds sensitive applicant
// PII, so on top of HR view access it's restricted to the roles that already
// manage employees elsewhere in the app — plus, narrowly, an Office
// Assistant granted the RECRUITING area. An Office Assistant's edit rights
// here come from their own RECRUITING area grant, never from HR
// department access (which SERVICE_MANAGER gets broadly and this role
// deliberately does not inherit) — see src/lib/officeAssistant.ts.
//
// This only governs whether the *page* lets the viewer in and whether its
// composer-style actions (send email/text, add note) are reachable at all.
// The much narrower rule for which *applicant stage transitions* an Office
// Assistant may make lives separately in
// src/app/(portal)/recruiting/applicants/actions.ts
// (assertRoutineStageTransition) — canEdit here does not imply the ability
// to move an applicant to a final hiring stage.
export async function requireRecruitingAccess() {
  const { session, canEdit } = await requireDepartmentAccess("HR");

  if (session.role === "OFFICE_ASSISTANT") {
    const recruitingAccess = await getAreaAccessForUser(session.sub, "RECRUITING");
    if (!recruitingAccess.canView) redirect("/");
    return { session, canEdit: recruitingAccess.canEdit };
  }

  if (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER") redirect("/");
  return { session, canEdit };
}
