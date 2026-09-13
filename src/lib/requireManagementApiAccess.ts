import { getSession, type SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasDepartmentAccess } from "@/lib/departments";

// API-route variant of requireDepartmentAccess("MANAGEMENT") — returns the
// session instead of redirecting, since a fetch call (not a page navigation)
// can't follow a redirect() the way a Server Component render can. Mirrors
// requireSalesApiAccess.ts.
export async function requireManagementApiAccess(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;

  const grants = await prisma.departmentAccess.findMany({
    where: { userId: session.sub },
    select: { department: true, canEdit: true },
  });
  const { canView } = hasDepartmentAccess(session.role, grants, "MANAGEMENT");
  return canView ? session : null;
}
