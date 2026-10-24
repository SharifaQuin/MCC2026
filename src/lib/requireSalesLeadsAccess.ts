import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "@/lib/session";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { getAreaAccessForUser } from "@/lib/officeAssistant";

// The app has one Lead model/page, not separate "Sales Leads" and
// "Callback Queue" systems — the owner's two area grants both unlock this
// same page for Office Assistant (Pedro's narrow lead/callback work),
// never the broader Sales department access SERVICE_MANAGER-equivalent
// roles get. Either grant is enough to view; either grant with edit is
// enough to edit the narrow set of fields the server actions allow.
export async function requireSalesLeadsAccess() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role === "OFFICE_ASSISTANT") {
    const [leadsAccess, callbackAccess] = await Promise.all([
      getAreaAccessForUser(session.sub, "SALES_LEADS"),
      getAreaAccessForUser(session.sub, "CALLBACK_QUEUE"),
    ]);
    const canView = leadsAccess.canView || callbackAccess.canView;
    const canEdit = leadsAccess.canEdit || callbackAccess.canEdit;
    if (!canView) redirect("/");
    return { session, canEdit };
  }

  return requireDepartmentAccess("SALES");
}

// Contact-correction authority only — deliberately a THIRD, narrower tier
// than canView/canEdit above. "Can see this lead at all" is enough to fix
// an email typo or stale phone number, the same way the recruiting side's
// updateApplicantContactInfoAction only ever needed canEdit there because
// no canView-but-not-canEdit tier previously existed for an applicant;
// here one already does (Pedro's own SALES_LEADS/CALLBACK_QUEUE grant is
// routinely view-only), so this must not require canEdit. Never widens
// *which* leads someone can see — only what a role already views, they may
// now also correct contact info on.
//
// Deliberately narrower than requireSalesLeadsAccess's own canView: this
// schema has NO field that reliably marks a user as "office staff" versus
// field/contractor — no contractor flag exists at all, Role is only
// TRAINEE | ADMIN | TRAINER | SERVICE_MANAGER | OFFICE_ASSISTANT, and
// DepartmentAccess (the mechanism requireSalesLeadsAccess falls back to for
// every non-Office-Assistant role) has no constraint stopping a TRAINEE or
// TRAINER from being granted SALES view access, nor any signal that a
// SERVICE_MANAGER with SALES access is actually office-based rather than
// field-based (see STAFF_ROLES in src/lib/staff.ts, which bundles
// SERVICE_MANAGER with TRAINEE/TRAINER for payroll/headcount purposes —
// the opposite grouping this access check would need to trust). Treating
// "has a SALES department grant" as "is office staff" would be unverified.
//
// So this intentionally recognizes only the two cases that ARE reliably
// office-bound by construction: ADMIN (the owner, always "office"), and
// OFFICE_ASSISTANT with an existing, owner-curated SALES_LEADS/
// CALLBACK_QUEUE view grant (Pedro's actual case — narrow, per-user, and
// already the exact mechanism this feature was built for). Every other
// role (including SERVICE_MANAGER, even with real SALES department access)
// is refused here until the owner has an explicit, reviewed way to mark an
// account as office staff — see the PR description for the gap this closes
// and a proposed follow-up (a dedicated per-user flag or area grant) for
// approval before widening past these two cases.
export async function assertLeadContactEditAccess(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Not authorized.");

  if (session.role === "ADMIN") return session;

  if (session.role === "OFFICE_ASSISTANT") {
    const [leadsAccess, callbackAccess] = await Promise.all([
      getAreaAccessForUser(session.sub, "SALES_LEADS"),
      getAreaAccessForUser(session.sub, "CALLBACK_QUEUE"),
    ]);
    if (!leadsAccess.canView && !callbackAccess.canView) throw new Error("Not authorized.");
    return session;
  }

  throw new Error("Not authorized.");
}

export async function assertSalesLeadsEditAccess() {
  const session = await getSession();
  if (!session) throw new Error("Not authorized.");

  if (session.role === "OFFICE_ASSISTANT") {
    const [leadsAccess, callbackAccess] = await Promise.all([
      getAreaAccessForUser(session.sub, "SALES_LEADS"),
      getAreaAccessForUser(session.sub, "CALLBACK_QUEUE"),
    ]);
    if (!leadsAccess.canEdit && !callbackAccess.canEdit) throw new Error("Not authorized.");
    return session;
  }

  const { session: s, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) throw new Error("Not authorized.");
  return s;
}
