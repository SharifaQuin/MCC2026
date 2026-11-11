import { redirect } from "next/navigation";
import type { PermissionArea } from "@prisma/client";
import { getSession, type SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SALES_REP_GRANTABLE_AREAS } from "@/lib/permissionAreas";

export { PERMISSION_AREAS, SALES_REP_GRANTABLE_AREAS } from "@/lib/permissionAreas";

export interface AreaAccessResult {
  canView: boolean;
  canEdit: boolean;
}

const SALES_REP_GRANTABLE_AREA_SET = new Set<PermissionArea>(SALES_REP_GRANTABLE_AREAS);

// Both roles whose access to these narrow HR/recruiting/training areas
// comes entirely from owner-configured AreaAccess grants, never from a
// whole department or from the role itself. Used wherever a restriction
// that already applies to a grant-based Office Assistant editor (a final-
// hiring-stage block, a blocked onboarding item, the extra audit logging
// a narrow owner-granted editor gets) must bind a grant-based Sales Rep
// editor identically — see src/app/(portal)/recruiting/applicants/
// actions.ts for the bulk of these. A Sales Rep only ever reaches this
// narrow HR-grant territory via her own AreaAccess row in the first place
// (resolveUserDepartments in src/lib/departments.ts permanently excludes
// HR from her whole-department access), so "role is SALES_REP" here always
// means "reached this via a grant," the same invariant OFFICE_ASSISTANT
// already relies on.
export function isAreaGrantRole(role: string): role is "OFFICE_ASSISTANT" | "SALES_REP" {
  return role === "OFFICE_ASSISTANT" || role === "SALES_REP";
}

// Deliberately re-reads the user's *current* role and grants from the
// database on every call, rather than trusting session.role (which is
// baked into a long-lived signed cookie and goes stale until the user's
// next login — see src/lib/session.ts). This is what lets the owner
// narrow or revoke someone's access and have it take effect on that
// person's very next request, with no re-login required, the same way
// requireDepartmentAccess already works for Sales/Operations/Management.
//
// Area grants only ever apply to OFFICE_ASSISTANT and SALES_REP (see
// isAreaGrantRole above). ADMIN keeps its existing full access everywhere.
// Every other role (TRAINEE, TRAINER, SERVICE_MANAGER) is untouched by this
// function's existence — their own access continues to come entirely from
// their existing role/department checks, never from AreaAccess rows. For
// SALES_REP specifically, only the narrow SALES_REP_GRANTABLE_AREAS subset
// is ever honored — a stray grant row for any other area (Staff Directory,
// Sales Leads, Callback Queue, Operational Status; left over from a past
// role change, or written directly against this function's own write-side
// guard in src/app/(portal)/admin/permissions/actions.ts) is ignored here
// too, so those areas stay closed to this role no matter what the
// database holds.
export async function getAreaAccessForUser(userId: string, area: PermissionArea): Promise<AreaAccessResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, active: true } });
  if (!user || !user.active) return { canView: false, canEdit: false };
  if (user.role === "ADMIN") return { canView: true, canEdit: true };
  if (!isAreaGrantRole(user.role)) return { canView: false, canEdit: false };
  if (user.role === "SALES_REP" && !SALES_REP_GRANTABLE_AREA_SET.has(area)) {
    return { canView: false, canEdit: false };
  }

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

// Nav already hides the Modules/Progress/Glossary links from an Office
// Assistant (or a Sales Rep) whose Training grant is "No access", but every
// one of those page routes (and the lesson-watched/quiz-submission routes
// beneath them) previously had no server-side check at all — a direct URL
// bypassed the grant entirely. Call this at the top of each, after any
// other role-specific redirects already there. A no-op for every role
// other than one of isAreaGrantRole's two (ADMIN, TRAINEE, TRAINER,
// SERVICE_MANAGER, etc. keep their existing, unrelated access to this
// content unchanged).
export async function requireOfficeAssistantTrainingAccess(session: SessionPayload): Promise<void> {
  if (!isAreaGrantRole(session.role)) return;
  const access = await getAreaAccessForUser(session.sub, "TRAINING");
  if (!access.canView) redirect("/");
}

// Non-redirecting variant for API routes (lesson-watched, quiz submission)
// — same boundary, a 403 instead of a navigation.
export async function assertOfficeAssistantTrainingAccess(session: SessionPayload): Promise<void> {
  if (!isAreaGrantRole(session.role)) return;
  const access = await getAreaAccessForUser(session.sub, "TRAINING");
  if (!access.canView) throw new Error("Not authorized.");
}

// Every area grant for one user in a single query — used by Nav/layout to
// decide which links to show without a round trip per area. For SALES_REP,
// only ever returns the SALES_REP_GRANTABLE_AREAS subset (same
// defense-in-depth filter as getAreaAccessForUser) — a stray grant row for
// any other area is silently dropped here too, so it can never surface as
// a nav link for this role.
export async function getAllAreaAccessForUser(
  userId: string
): Promise<{ role: string | null; areas: Partial<Record<PermissionArea, AreaAccessResult>> }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, active: true, areaAccess: { select: { area: true, canEdit: true } } },
  });
  if (!user || !user.active) return { role: null, areas: {} };
  if (!isAreaGrantRole(user.role)) return { role: user.role, areas: {} };

  const areas: Partial<Record<PermissionArea, AreaAccessResult>> = {};
  for (const grant of user.areaAccess) {
    if (user.role === "SALES_REP" && !SALES_REP_GRANTABLE_AREA_SET.has(grant.area)) continue;
    areas[grant.area] = { canView: true, canEdit: grant.canEdit };
  }
  return { role: user.role, areas };
}

// Several staff/HR pages (payroll, departed roster, document templates,
// etc.) only ever checked role at the middleware path-prefix level, which
// was safe while only ADMIN/SERVICE_MANAGER could reach /staff at all.
// Office Assistant is now also admitted past that gate (narrowly, for its
// own bounded staff view), so pages carrying real payroll/disciplinary
// data need their own explicit block for this role specifically — this
// never touches ADMIN/SERVICE_MANAGER/any other role's existing access.
export async function blockOfficeAssistant(): Promise<void> {
  const session = await getSession();
  if (session?.role === "OFFICE_ASSISTANT") redirect("/");
}

// Whether the *current* (live, DB-fetched) role is OFFICE_ASSISTANT — used
// by shared pages/components (Home, To-Do, Staff) that need to branch
// behavior for this role specifically, not just gate an area.
export async function getLiveRole(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role ?? null;
}
