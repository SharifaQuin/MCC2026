import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";
import { getAreaAccessForUser } from "@/lib/officeAssistant";
import { formatInBusinessTimezone } from "@/lib/timezone";
import ApprovalRequestControls, { type ApprovalRequestRow } from "./ApprovalRequestControls";

// Shown to two different audiences on the same applicant page: an Office
// Assistant who can submit a request here (if they have RECRUITING edit),
// and the applicant's own routed manager, who can decide a pending one.
// Each only ever sees their own side of a request — a requester never sees
// another requester's rows, and a non-manager viewer sees nothing here at
// all besides their own submitted history.
export default async function ApprovalRequestPanel({
  applicantId,
  session,
  openRejectionRequest,
}: {
  applicantId: string;
  session: SessionPayload;
  // Set when StageControls' "Request rejection" link (the Office
  // Assistant's replacement for the direct Reject controls) navigated here
  // with ?rejectRequest=1 — opens the composer below already on REJECT_APPLICANT,
  // rather than making them find and click "Request Approval" themselves.
  openRejectionRequest?: boolean;
}) {
  const canSubmit =
    session.role === "OFFICE_ASSISTANT" &&
    (await getAreaAccessForUser(session.sub, "RECRUITING")).canEdit;

  const isAdmin = session.role === "ADMIN";
  const canDecideAsManager = session.role === "ADMIN" || session.role === "SERVICE_MANAGER";

  if (!canSubmit && !canDecideAsManager) return null;

  const requests = await prisma.approvalRequest.findMany({
    where: {
      applicantId,
      OR: [
        ...(isAdmin ? [{}] : []),
        { requesterId: session.sub },
        ...(canDecideAsManager ? [{ managerId: session.sub }] : []),
      ],
    },
    include: {
      requester: { select: { name: true } },
      manager: { select: { name: true } },
      decidedBy: { select: { name: true } },
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
    canDecide: canDecideAsManager && r.managerId === session.sub && r.requesterId !== session.sub,
    canMarkExecuted: r.decidedById === session.sub,
    canRetryExecution: r.decidedById === session.sub,
  }));

  return (
    <div id="approval-requests" className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 font-medium text-neutral-900">Approval Requests</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Rejecting, offering, or sending a message only ever records a decision here — the manager
        still carries that out themselves, manually, afterward. An in-person interview request is
        different: approving it books the interview and sends the candidate's usual confirmation
        automatically. A working session request is different too: approving it saves the
        approved date/time to the working session record automatically, but never contacts the
        candidate — that stays a manual step for now.
      </p>
      <ApprovalRequestControls
        applicantId={applicantId}
        canSubmit={canSubmit}
        rows={rows}
        initialOpenReject={Boolean(openRejectionRequest)}
      />
    </div>
  );
}
