import { redirect } from "next/navigation";
import type { PermissionArea } from "@prisma/client";
import { getSession, type SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export { PERMISSION_AREAS } from "@/lib/permissionAreas";

export interface AreaAccessResult {
  canView: boolean;
  canEdit: boolean;
}

// Deliberately re-reads the user's *current* role and grants from the
// database on every call, rather than trusting session.role (which is
// baked into a long-lived signed cookie and goes stale until the user's
// next login — see src/lib/session.ts). This is what lets the owner
// narrow or revoke an Office Assistant's access and have it take effect
// on that person's very next request, with no re-login required, the same
// way requireDepartmentAccess already works for Sales/Operations/Management.
//
// Area grants only ever apply to the OFFICE_ASSISTANT role. ADMIN keeps its
// existing full access everywhere. Every other role (TRAINEE, TRAINER,
// SERVICE_MANAGER) is untouched by this function's existence — their own
// access continues to come entirely from their existing role/department
// checks, never from AreaAccess rows.
export async function getAreaAccessForUser(userId: string, area: PermissionArea): Promise<AreaAccessResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, active: true } });
  if (!user || !user.active) return { canView: false, canEdit: false };
  if (user.role === "ADMIN") return { canView: true, canEdit: true };
  if (user.role !== "OFFICE_ASSISTANT") return { canView: false, canEdit: false };

  const grant = await prisma.areaAccess.findUnique({
    where: { userId_area: { userId, area } },
  });
  if (!grant) return { canView: false, canEdit: false };
  return { canView: true, canEdit: grant.canEdit };
}

export async function requireAreaAccess(
  area: PermissionArea,
  opts: { edit?: boolean } = {}
): Promise<{ session: SessionPayload; canEdit: boolean }> {
  const session = await getSession();
  if (!session) redirect("/login");

  const access = await getAreaAccessForUser(session.sub, area);
  if (!access.canView) redirect("/");
  if (opts.edit && !access.canEdit) redirect("/");

  return { session, canEdit: access.canEdit };
}

// Non-redirecting variant for server actions, which should fail loudly
// rather than silently navigate the caller away.
export async function assertAreaAccess(
  area: PermissionArea,
  opts: { edit?: boolean } = {}
): Promise<{ session: SessionPayload; canEdit: boolean }> {
  const session = await getSession();
  if (!session) throw new Error("Not authorized.");

  const access = await getAreaAccessForUser(session.sub, area);
  if (!access.canView || (opts.edit && !access.canEdit)) throw new Error("Not authorized.");

  return { session, canEdit: access.canEdit };
}

// Whether the *current* (live, DB-fetched) role is OFFICE_ASSISTANT — used
// by shared pages/components (Home, To-Do, Staff) that need to branch
// behavior for this role specifically, not just gate an area.
export async function getLiveRole(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role ?? null;
}
