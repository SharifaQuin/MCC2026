import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatInBusinessTimezone } from "@/lib/timezone";
import ApprovalQueueList from "./ApprovalQueueList";
import type { ApprovalRequestRow } from "../applicants/[id]/ApprovalRequestControls";

// The manager's "Pending approvals queue" — every request currently routed
// to this manager, across all applicants. Deciding here is the same
// decideApprovalRequestAction used on the applicant detail page; this view
// just aggregates across applicants so nothing sits unseen.
export default async function ApprovalsQueuePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER") redirect("/");

  const requests = await prisma.approvalRequest.findMany({
    where: { managerId: session.sub },
    include: {
      requester: { select: { name: true } },
      manager: { select: { name: true } },
      decidedBy: { select: { name: true } },
      applicant: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: ApprovalRequestRow[] = requests.map((r) => ({
    id: r.id,
    requesterName: r.requester.name,
    managerName: r.manager.name,
    actionType: r.actionType,
    rationale: r.rationale,
    proposedOutcome: r.proposedOutcome,
    recipientEmail: r.recipientEmail,
    messageText: r.messageText,
    proposedScheduledAt: r.proposedScheduledAt ? r.proposedScheduledAt.toISOString() : null,
    proposedScheduledAtDisplay: r.proposedScheduledAt ? formatInBusinessTimezone(r.proposedScheduledAt, undefined, true) : null,
    decidedScheduledAt: r.decidedScheduledAt ? r.decidedScheduledAt.toISOString() : null,
    decidedScheduledAtDisplay: r.decidedScheduledAt ? formatInBusinessTimezone(r.decidedScheduledAt, undefined, true) : null,
    executionStatus: r.executionStatus,
    executionError: r.executionError,
    status: r.status,
    decisionNote: r.decisionNote,
    decidedByName: r.decidedBy?.name ?? null,
    executedAt: r.executedAt ? r.executedAt.toISOString() : null,
    isMine: r.requesterId === session.sub,
    canDecide: r.requesterId !== session.sub,
    canMarkExecuted: r.decidedById === session.sub,
    canRetryExecution: r.decidedById === session.sub,
    applicantId: r.applicantId,
    applicantName: `${r.applicant.firstName} ${r.applicant.lastName}`,
  }));

  const pending = rows.filter((r) => r.status === "PENDING" || r.status === "NEEDS_RESUBMISSION");
  const decided = rows.filter((r) => r.status !== "PENDING" && r.status !== "NEEDS_RESUBMISSION");

  return (
    <div>
      <div className="mb-6">
        <Link href="/recruiting" className="text-sm text-brand-700 hover:underline">
          ← Back to Recruiting
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Pending Approvals</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Requests from Office Assistants awaiting your decision. Approving a rejection, an offer,
          or a message only ever records a decision — you still carry out that final hiring stage
          or send yourself, as a separate, manual step. Approving an in-person interview request is
          different: it books the interview and sends the candidate's usual confirmation
          automatically. Approving a working session request saves the approved date/time to the
          working session record automatically, but never contacts the candidate — that stays
          manual for now.
        </p>
      </div>

      <ApprovalQueueList pending={pending} decided={decided} />
    </div>
  );
}
