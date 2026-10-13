import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { getAreaAccessForUser } from "@/lib/officeAssistant";
import { prisma } from "@/lib/prisma";
import ComingSoonDepartment from "@/components/ComingSoonDepartment";
import OfficeAssistantOperationalStatus from "./OfficeAssistantOperationalStatus";

export default async function OperationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role === "OFFICE_ASSISTANT") {
    const access = await getAreaAccessForUser(session.sub, "OPERATIONAL_STATUS");
    if (!access.canView) redirect("/");

    // Deliberately minimal: date/block/window/city/status only — no price,
    // no person-hours, no rep/route assignment. This app has no separate
    // dispatch/call-out/service-issue tracking today beyond slot bookings,
    // so that's genuinely all there is to show safely here; see the final
    // report for what a fuller Operations view would still need.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bookings = await prisma.slotBooking.findMany({
      where: { date: { gte: today }, status: { not: "RELEASED" } },
      orderBy: [{ date: "asc" }, { block: "asc" }],
      take: 100,
      select: { id: true, date: true, block: true, window: true, city: true, status: true, clientName: true },
    });

    return (
      <OfficeAssistantOperationalStatus
        bookings={bookings.map((b) => ({
          id: b.id,
          date: b.date.toISOString(),
          block: b.block,
          window: b.window,
          city: b.city,
          status: b.status,
          clientName: b.clientName,
        }))}
      />
    );
  }

  const { canEdit } = await requireDepartmentAccess("OPERATIONS");
  return <ComingSoonDepartment title="Operations" canEdit={canEdit} />;
}
