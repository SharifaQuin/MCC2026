import { prisma } from "@/lib/prisma";

export async function loadEmployeeSummaries() {
  const totalModules = await prisma.module.count({ where: { published: true } });
  const users = await prisma.user.findMany({
    where: { role: { in: ["TRAINEE"] } },
    orderBy: { createdAt: "desc" },
    include: {
      progress: { where: { status: "COMPLETED" } },
    },
  });

  return { totalModules, users };
}

export type EmployeeSummaries = Awaited<ReturnType<typeof loadEmployeeSummaries>>;
