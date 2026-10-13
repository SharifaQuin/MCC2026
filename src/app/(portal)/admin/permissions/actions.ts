"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { Role } from "@/lib/session";
import type { Department, PermissionArea } from "@prisma/client";
import { PERMISSION_AREAS } from "@/lib/officeAssistant";
import { logAudit } from "@/lib/auditLog";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Not authorized");
  return session;
}

// Granting full ADMIN/Owner access is deliberately not exposed here — that
// stays a manual, out-of-band decision rather than a dropdown pick.
const ASSIGNABLE_ROLES = new Set<Role>(["TRAINEE", "TRAINER", "SERVICE_MANAGER", "OFFICE_ASSISTANT"]);

export async function updateUserRoleAction(userId: string, role: string) {
  const session = await requireAdmin();
  if (!ASSIGNABLE_ROLES.has(role as Role)) throw new Error("Invalid role");
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  await prisma.user.update({ where: { id: userId }, data: { role: role as Role } });
  await logAudit({
    actorId: session.sub,
    action: "ROLE_CHANGED",
    recordType: "User",
    recordId: userId,
    changedFields: { role: { from: before?.role, to: role } },
  });
  revalidatePath("/admin/permissions");
}

export type AccessLevel = "NONE" | "VIEW" | "EDIT";

// HR access is implicit (everyone already has it via their Role) and isn't
// managed as a grant here — only the departments beyond it are.
const GRANTABLE_DEPARTMENTS = new Set<Department>(["SALES", "OPERATIONS", "MANAGEMENT"]);

export async function updateDepartmentAccessAction(
  userId: string,
  department: string,
  level: AccessLevel
) {
  const session = await requireAdmin();
  if (!GRANTABLE_DEPARTMENTS.has(department as Department)) throw new Error("Invalid department");
  const dept = department as Department;

  if (level === "NONE") {
    await prisma.departmentAccess.deleteMany({ where: { userId, department: dept } });
  } else {
    await prisma.departmentAccess.upsert({
      where: { userId_department: { userId, department: dept } },
      create: { userId, department: dept, canEdit: level === "EDIT" },
      update: { canEdit: level === "EDIT" },
    });
  }
  await logAudit({
    actorId: session.sub,
    action: "DEPARTMENT_ACCESS_CHANGED",
    recordType: "User",
    recordId: userId,
    changedFields: { [`department:${dept}`]: { to: level } },
  });
  revalidatePath("/admin/permissions");
}

const GRANTABLE_AREAS = new Set<PermissionArea>(PERMISSION_AREAS.map((a) => a.area));

// Office Assistant's own finer-grained areas — same None/View/Edit shape as
// department access, but only ever consulted for that one role (see
// getAreaAccessForUser). Changing this takes effect on that person's very
// next request, no re-login required.
export async function updateAreaAccessAction(userId: string, area: string, level: AccessLevel) {
  const session = await requireAdmin();
  if (!GRANTABLE_AREAS.has(area as PermissionArea)) throw new Error("Invalid area");
  const permArea = area as PermissionArea;

  if (level === "NONE") {
    await prisma.areaAccess.deleteMany({ where: { userId, area: permArea } });
  } else {
    await prisma.areaAccess.upsert({
      where: { userId_area: { userId, area: permArea } },
      create: { userId, area: permArea, canEdit: level === "EDIT" },
      update: { canEdit: level === "EDIT" },
    });
  }
  await logAudit({
    actorId: session.sub,
    action: "AREA_ACCESS_CHANGED",
    recordType: "User",
    recordId: userId,
    changedFields: { [`area:${permArea}`]: { to: level } },
  });
  revalidatePath("/admin/permissions");
}

// Who an Office Assistant's "Send for approval" requests route to. Pass an
// empty string to clear it (shows the setup blocker instead of letting
// submissions route to nobody or a stale manager).
export async function updateApprovalManagerAction(userId: string, managerId: string) {
  const session = await requireAdmin();
  const trimmed = managerId.trim();

  if (trimmed) {
    const manager = await prisma.user.findUnique({ where: { id: trimmed }, select: { role: true, active: true } });
    if (!manager || !manager.active || (manager.role !== "ADMIN" && manager.role !== "SERVICE_MANAGER")) {
      throw new Error("Chosen manager must be an active Admin or Service Manager.");
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { approvalManagerId: trimmed || null },
  });
  await logAudit({
    actorId: session.sub,
    action: "APPROVAL_MANAGER_CHANGED",
    recordType: "User",
    recordId: userId,
    changedFields: { approvalManagerId: { to: trimmed || null } },
  });
  revalidatePath("/admin/permissions");
}

// Candidate managers for the approval-manager picker — anyone with real
// decision authority today (ADMIN or SERVICE_MANAGER), active only.
export async function getEligibleApprovalManagers() {
  return prisma.user.findMany({
    where: { active: true, isTestAccount: false, role: { in: ["ADMIN", "SERVICE_MANAGER"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
