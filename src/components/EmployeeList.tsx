import Link from "next/link";
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

type Summaries = Awaited<ReturnType<typeof loadEmployeeSummaries>>;

export function EmployeeListView({
  data,
  basePath,
}: {
  data: Summaries;
  basePath: string;
}) {
  const { totalModules, users } = data;

  return (
    <div className="space-y-3">
      {users.length === 0 && <p className="text-sm text-neutral-500">No employees yet.</p>}
      {users.map((u) => (
        <Link
          key={u.id}
          href={`${basePath}/${u.id}`}
          className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand-300"
        >
          <div className={u.active ? "" : "opacity-50"}>
            <p className="font-medium">{u.name}</p>
            <p className="text-xs text-neutral-500">{u.email}</p>
            {!u.active && (
              <p className="mt-1 text-xs font-medium text-red-600">Deactivated</p>
            )}
            {u.active && u.mustSetPassword && (
              <p className="mt-1 text-xs font-medium text-amber-600">Invite pending</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {u.certificationStatus === "CERTIFIED" && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                Technician
              </span>
            )}
            {u.certificationStatus === "PENDING" && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                Pending Review
              </span>
            )}
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
              {u.progress.length} / {totalModules} modules
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
