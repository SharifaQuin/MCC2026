import { prisma } from "@/lib/prisma";
import { PERMISSION_AREAS } from "@/lib/officeAssistant";
import PermissionsTable, { type PermissionUserRow } from "./PermissionsTable";
import type { AccessLevel } from "./actions";
import { getEligibleApprovalManagers } from "./actions";

export default async function PermissionsPage() {
  const [users, eligibleManagers] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "ADMIN" } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        departmentAccess: { select: { department: true, canEdit: true } },
        areaAccess: { select: { area: true, canEdit: true } },
        approvalManagerId: true,
      },
    }),
    getEligibleApprovalManagers(),
  ]);

  const rows: PermissionUserRow[] = users.map((u) => {
    const access: PermissionUserRow["access"] = {
      SALES: "NONE",
      OPERATIONS: "NONE",
      MANAGEMENT: "NONE",
    };
    for (const grant of u.departmentAccess) {
      if (grant.department === "HR") continue;
      const level: AccessLevel = grant.canEdit ? "EDIT" : "VIEW";
      access[grant.department as "SALES" | "OPERATIONS" | "MANAGEMENT"] = level;
    }

    const areaAccess: PermissionUserRow["areaAccess"] = Object.fromEntries(
      PERMISSION_AREAS.map((a) => [a.area, "NONE" as AccessLevel])
    ) as PermissionUserRow["areaAccess"];
    for (const grant of u.areaAccess) {
      areaAccess[grant.area] = grant.canEdit ? "EDIT" : "VIEW";
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as "TRAINEE" | "TRAINER" | "SERVICE_MANAGER" | "OFFICE_ASSISTANT",
      access,
      areaAccess,
      approvalManagerId: u.approvalManagerId,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Permissions</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Assign roles and grant employees access to departments beyond HR — useful for an
          assistant or virtual assistant who needs to see (or edit) a specific department
          without full Owner access. Office Assistant rows also get finer-grained area
          controls below, instead of whole-department access.
        </p>
      </div>
      <PermissionsTable users={rows} eligibleManagers={eligibleManagers} />
    </div>
  );
}
