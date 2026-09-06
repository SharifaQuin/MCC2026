import type { Department } from "@prisma/client";
import type { Role } from "@/lib/session";

export const DEPARTMENT_ORDER: Department[] = ["HR", "SALES", "OPERATIONS", "MANAGEMENT"];

export const DEPARTMENT_INFO: Record<
  Department,
  { labelEn: string; labelEs: string; href: string; comingSoon: boolean }
> = {
  HR: { labelEn: "HR", labelEs: "RRHH", href: "/", comingSoon: false },
  SALES: { labelEn: "Sales", labelEs: "Ventas", href: "/sales", comingSoon: true },
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
export function resolveUserDepartments(
  role: Role,
  grants: DepartmentGrant[]
): AccessibleDepartment[] {
  if (role === "ADMIN") {
    return DEPARTMENT_ORDER.map((department) => ({ department, canEdit: true }));
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
