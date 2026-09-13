import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { prisma } from "@/lib/prisma";
import { nextMondayFrom } from "@/lib/weeklyUpdate";
import WeeklyUpdateManager, { type WeeklyUpdateRow } from "@/components/WeeklyUpdateManager";

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function ManagementPage() {
  const { canEdit } = await requireDepartmentAccess("MANAGEMENT");

  const updates = await prisma.weeklyUpdate.findMany({
    orderBy: { weekOf: "desc" },
    take: 12,
  });

  const rows: WeeklyUpdateRow[] = updates.map((u) => ({
    id: u.id,
    weekOf: toDateKey(u.weekOf),
    status: u.status,
    formattedMessage: u.formattedMessage,
    sentAt: u.sentAt ? u.sentAt.toISOString() : null,
    spotlightName: u.spotlightName,
    spotlightReason: u.spotlightReason,
    homesCleaned: u.homesCleaned,
    commercialServiced: u.commercialServiced,
    avgRating: u.avgRating,
    clientShoutout: u.clientShoutout,
    companyUpdates: u.companyUpdates,
    weeklyGoal: u.weeklyGoal,
    coreValue: u.coreValue,
    coreValueDescription: u.coreValueDescription,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Management</h1>
          <p className="mt-1 text-sm text-neutral-500">Monday Team Update — draft, approve, and send to Slack.</p>
        </div>
        <Link
          href="/management/route-board"
          className="shrink-0 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Route Board →
        </Link>
      </div>
      <WeeklyUpdateManager updates={rows} canEdit={canEdit} defaultWeekOf={toDateKey(nextMondayFrom())} />
    </div>
  );
}
