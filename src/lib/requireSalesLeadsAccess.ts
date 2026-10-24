import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "@/lib/session";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { getAreaAccessForUser } from "@/lib/officeAssistant";
import { hasDepartmentAccess } from "@/lib/departments";
import { prisma } from "@/lib/prisma";

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
// The rule, as decided by the owner: any non-field member with real
// lead-view access qualifies — TRAINEE and TRAINER (field roles) stay
// excluded outright, by name, regardless of any lead access they might
// (even accidentally) have been granted; every other role — ADMIN,
// OFFICE_ASSISTANT with its existing per-user area grant, SERVICE_MANAGER,
// and any future non-field role (e.g. a Sales Rep) — qualifies once they
// actually have real, owner-granted lead-view access. That's checked the
// same way requireSalesLeadsAccess itself checks it (OFFICE_ASSISTANT via
// its own SALES_LEADS/CALLBACK_QUEUE area grants, everyone else via the
// SALES DepartmentAccess grant), never inferred from role alone — a role
// that merely *can* reach this far (having passed requireSalesLeadsAccess's
// own canView gate) still only qualifies if it isn't TRAINEE/TRAINER.
export async function assertLeadContactEditAccess(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Not authorized.");

  if (session.role === "TRAINEE" || session.role === "TRAINER") {
    throw new Error("Not authorized.");
  }

  if (session.role === "ADMIN") return session;

  if (session.role === "OFFICE_ASSISTANT") {
    const [leadsAccess, callbackAccess] = await Promise.all([
      getAreaAccessForUser(session.sub, "SALES_LEADS"),
      getAreaAccessForUser(session.sub, "CALLBACK_QUEUE"),
    ]);
    if (!leadsAccess.canView && !callbackAccess.canView) throw new Error("Not authorized.");
    return session;
  }

  const grants = await prisma.departmentAccess.findMany({
    where: { userId: session.sub },
    select: { department: true, canEdit: true },
  });
  const { canView } = hasDepartmentAccess(session.role, grants, "SALES");
  if (!canView) throw new Error("Not authorized.");
  return session;
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
