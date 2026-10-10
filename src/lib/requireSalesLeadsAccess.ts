import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
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
