"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { Role } from "@/lib/session";
import type { Department } from "@prisma/client";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Not authorized");
}

// Granting full ADMIN/Owner access is deliberately not exposed here — that
// stays a manual, out-of-band decision rather than a dropdown pick.
const ASSIGNABLE_ROLES = new Set<Role>(["TRAINEE", "TRAINER", "SERVICE_MANAGER"]);

export async function updateUserRoleAction(userId: string, role: string) {
  await requireAdmin();
  if (!ASSIGNABLE_ROLES.has(role as Role)) throw new Error("Invalid role");
  await prisma.user.update({ where: { id: userId }, data: { role: role as Role } });
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
  await requireAdmin();
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
  revalidatePath("/admin/permissions");
}
