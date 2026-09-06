import { prisma } from "@/lib/prisma";
import PermissionsTable, { type PermissionUserRow } from "./PermissionsTable";
import type { AccessLevel } from "./actions";

export default async function PermissionsPage() {
  const users = await prisma.user.findMany({
    where: { role: { not: "ADMIN" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      departmentAccess: { select: { department: true, canEdit: true } },
    },
  });

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
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as "TRAINEE" | "TRAINER" | "SERVICE_MANAGER",
      access,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Permissions</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Assign the Service Manager role and grant employees access to departments beyond
          HR — useful for an assistant or virtual assistant who needs to see (or edit) a
          specific department without full Owner access.
        </p>
      </div>
      <PermissionsTable users={rows} />
    </div>
  );
}
