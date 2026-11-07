import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasDepartmentAccess } from "@/lib/departments";
import { formatInBusinessTimezone } from "@/lib/timezone";
import { isSmsQuietHours } from "@/lib/scheduledMessages";
import ScheduledMessagesList, { type ScheduledMessageRow } from "./ScheduledMessagesList";

export const dynamic = "force-dynamic";

// One combined list for both Lead (Sales) and Applicant (Recruiting)
// scheduled sends — each viewer only sees (and can edit/cancel) the side(s)
// they already have access to compose on.
export default async function ScheduledMessagesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const grants = await prisma.departmentAccess.findMany({
    where: { userId: session.sub },
    select: { department: true, canEdit: true },
  });
  const sales = hasDepartmentAccess(session.role, grants, "SALES");
  const hr = hasDepartmentAccess(session.role, grants, "HR");
  const hasRecruitingAccess = hr.canView && (session.role === "ADMIN" || session.role === "SERVICE_MANAGER");

  if (!sales.canView && !hasRecruitingAccess) redirect("/");

  const messages = await prisma.scheduledMessage.findMany({
    where: {
      AND: [
        // A rep's own manual cancellation stays invisible here, same as
        // always — but a system cancellation (currently just Scam
        // classification, which always sets cancelReason) stays visible so
        // "this send was stopped, and why" doesn't just silently vanish.
        { OR: [{ status: { in: ["PENDING", "FAILED"] } }, { status: "CANCELLED", cancelReason: { not: null } }] },
        {
          OR: [
            ...(sales.canView ? [{ leadId: { not: null } }] : []),
            ...(hasRecruitingAccess ? [{ applicantId: { not: null } }] : []),
          ],
        },
      ],
    },
    include: {
      lead: { select: { firstName: true, lastName: true } },
      applicant: { select: { firstName: true, lastName: true } },
    },
    orderBy: { sendAt: "asc" },
  });

  const rows: ScheduledMessageRow[] = messages.map((m) => {
    const recipientType = m.leadId ? "LEAD" : "APPLICANT";
    const recipient = m.lead ?? m.applicant;
    return {
      id: m.id,
      recipientType,
      recipientId: (m.leadId ?? m.applicantId)!,
      recipientName: recipient ? `${recipient.firstName} ${recipient.lastName}` : "(unknown)",
      channel: m.channel,
      subject: m.subject,
      body: m.body,
      sendAtIso: m.sendAt.toISOString(),
      sendAtDisplay: formatInBusinessTimezone(m.sendAt),
      // The where clause above only ever selects PENDING/FAILED/system-
      // cancelled rows — Prisma's generated type just doesn't know that at
      // compile time.
      status: m.status as "PENDING" | "FAILED" | "CANCELLED",
      errorMessage: m.errorMessage,
      cancelReason: m.cancelReason,
      quietHours: m.channel === "SMS" && isSmsQuietHours(m.sendAt),
      canEdit: recipientType === "LEAD" ? sales.canEdit : hr.canEdit,
    };
  });

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">Scheduled Sends</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Emails and texts queued to go out later, earliest first. Times are Pacific.
      </p>

      <div className="mt-6">
        <ScheduledMessagesList rows={rows} />
      </div>
    </div>
  );
}
