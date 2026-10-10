import type { Department } from "@prisma/client";
import type { Role } from "@/lib/session";

export const DEPARTMENT_ORDER: Department[] = ["HR", "SALES", "OPERATIONS", "MANAGEMENT"];

export const DEPARTMENT_INFO: Record<
  Department,
  { labelEn: string; labelEs: string; href: string; comingSoon: boolean }
> = {
  HR: { labelEn: "HR", labelEs: "RRHH", href: "/hr", comingSoon: false },
  SALES: { labelEn: "Sales", labelEs: "Ventas", href: "/sales", comingSoon: false },
  OPERATIONS: {
    labelEn: "Operations",
    labelEs: "Operaciones",
    href: "/operations",
    comingSoon: true,
  },
  MANAGEMENT: {
    labelEn: "Management",
    labelEs: "Gerencia",
    href: "/management",
    comingSoon: true,
  },
};

export interface DepartmentGrant {
  department: Department;
  canEdit: boolean;
}

export interface AccessibleDepartment {
  department: Department;
  canEdit: boolean;
}

// Admin/Owner sees every department with full edit rights. Everyone else
// always has (view) access to HR — that's the training/onboarding portal
// they already use — plus whatever else has been explicitly granted to them
// (e.g. an assistant given Sales access).
//
// OFFICE_ASSISTANT is a deliberate exception to that last part: its access
// to Sales/Operations/Management (and anything finer-grained within them)
// comes entirely from the separate, narrower AreaAccess grants in
// src/lib/officeAssistant.ts, never from whole-department DepartmentAccess
// rows — even if a stale grant row exists for this user (e.g. left over
// from before they were reassigned to this role from one that did use
// department access). Only HR view (never edit) carries over, matching
// every other non-admin, non-service-manager role.
export function resolveUserDepartments(
  role: Role,
  grants: DepartmentGrant[]
): AccessibleDepartment[] {
  if (role === "ADMIN") {
    return DEPARTMENT_ORDER.map((department) => ({ department, canEdit: true }));
  }

  if (role === "OFFICE_ASSISTANT") {
    return [{ department: "HR", canEdit: false }];
  }

  const result: AccessibleDepartment[] = [
    { department: "HR", canEdit: role === "SERVICE_MANAGER" },
  ];
  for (const grant of grants) {
    if (grant.department === "HR") continue;
    result.push({ department: grant.department, canEdit: grant.canEdit });
  }
  return result.sort(
    (a, b) => DEPARTMENT_ORDER.indexOf(a.department) - DEPARTMENT_ORDER.indexOf(b.department)
  );
}

export function hasDepartmentAccess(
  role: Role,
  grants: DepartmentGrant[],
  department: Department
): { canView: boolean; canEdit: boolean } {
  const accessible = resolveUserDepartments(role, grants);
  const found = accessible.find((d) => d.department === department);
  return { canView: !!found, canEdit: found?.canEdit ?? false };
}
