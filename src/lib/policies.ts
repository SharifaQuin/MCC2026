import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/session";

export interface PolicyDocumentRow {
  id: string;
  title: string;
  filename: string;
}

// ADMIN/Owner always sees every policy, matching the access pattern used
// everywhere else in this app (e.g. getChecklistTasksForRole). Everyone else
// only sees documents explicitly opened to their role — an empty
// visibleToRoles array (the default, and currently the only state that
// exists, since no documents have been added yet) means nobody but the
// Owner sees it, never "everyone" by default.
export async function getPoliciesForRole(role: Role): Promise<PolicyDocumentRow[]> {
  return prisma.policyDocument.findMany({
    where: role === "ADMIN" ? undefined : { visibleToRoles: { has: role } },
    orderBy: { title: "asc" },
    select: { id: true, title: true, filename: true },
  });
}
