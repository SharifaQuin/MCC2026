import { redirect } from "next/navigation";
import type { Department } from "@prisma/client";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasDepartmentAccess } from "@/lib/departments";

export async function requireDepartmentAccess(department: Department) {
  const session = await getSession();
  if (!session) redirect("/login");

  const grants = await prisma.departmentAccess.findMany({
    where: { userId: session.sub },
    select: { department: true, canEdit: true },
  });

  const { canView, canEdit } = hasDepartmentAccess(session.role, grants, department);
  if (!canView) redirect("/");

  return { session, canEdit };
}
