"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { assertAreaAccess } from "@/lib/officeAssistant";
import { logAudit } from "@/lib/auditLog";
import { getTrueActorId } from "@/lib/impersonation";
import { zonedTimeToUtc } from "@/lib/timezone";
import {
  claimExecutionAttempt,
  executeApprovedInPersonInterview,
  executeApprovedWorkingSession,
} from "@/lib/approvalExecution";
import type { ApprovalActionType } from "@prisma/client";

// Limited to recruiting decisions/offers/messages, plus Pedro's two
// "request next step" scheduling kinds — never expand this set to payroll,
// discounts, account access, or anything else without a fresh design pass.
const VALID_ACTION_TYPES = new Set<ApprovalActionType>([
  "REJECT_APPLICANT",
  "OFFER_APPLICANT",
  "SEND_MESSAGE",
  "SCHEDULE_IN_PERSON_INTERVIEW",
  "SCHEDULE_WORKING_SESSION",
]);

const SCHEDULING_ACTION_TYPES = new Set<ApprovalActionType>([
  "SCHEDULE_IN_PERSON_INTERVIEW",
  "SCHEDULE_WORKING_SESSION",
]);

// Short, consistent "proposed outcome" text for the two scheduling kinds —
// these never ask Pedro to separately describe terms the way
// OFFER/REJECT/SEND_MESSAGE do; proposedScheduledAt is the real structured
// detail, this is just what every existing request row already displays.
const SCHEDULING_OUTCOME_LABEL: Partial<Record<ApprovalActionType, string>> = {
  SCHEDULE_IN_PERSON_INTERVIEW: "Schedule an in-person interview at the proposed date/time.",
  SCHEDULE_WORKING_SESSION: "Schedule a working session at the proposed date/time.",
};

export interface ApprovalActionResult {
  ok: boolean;
  error?: string;
}

// Pedro (or any future Office Assistant) submitting a request. This never
// changes the applicant's stage, sends anything, or creates an employee —
// it only ever writes an ApprovalRequest row for the designated manager to
// later decide on, and separately, manually, carry out.
export async function submitApprovalRequestAction(formData: FormData): Promise<ApprovalActionResult> {
  const { session } = await assertAreaAccess("RECRUITING", { edit: true });

  const applicantId = String(formData.get("applicantId") ?? "").trim();
  const actionTypeRaw = String(formData.get("actionType") ?? "");
  const rationale = String(formData.get("rationale") ?? "").trim();
  const recipientEmail = String(formData.get("recipientEmail") ?? "").trim() || null;
  const messageText = String(formData.get("messageText") ?? "").trim() || null;

  if (!applicantId) return { ok: false, error: "Missing applicant." };
  if (!VALID_ACTION_TYPES.has(actionTypeRaw as ApprovalActionType)) return { ok: false, error: "Invalid action type." };
  const actionType = actionTypeRaw as ApprovalActionType;
  const isScheduling = SCHEDULING_ACTION_TYPES.has(actionType);

  // Pedro's "note" for a scheduling request lives in rationale — the same
  // free-text field REJECT/OFFER/SEND_MESSAGE already require, just not
  // framed as a "why" here. Still required: a next-step request with no
  // context isn't useful to the manager reviewing it.
  if (!rationale) {
    return { ok: false, error: isScheduling ? "Add a note for the manager." : "Explain why you're requesting this." };
  }

  let proposedOutcome: string;
  let proposedScheduledAt: Date | undefined;
  if (isScheduling) {
    const proposedScheduledAtRaw = String(formData.get("proposedScheduledAt") ?? "").trim();
    if (!proposedScheduledAtRaw) return { ok: false, error: "Propose a date and time." };
    proposedScheduledAt = zonedTimeToUtc(proposedScheduledAtRaw);
    if (Number.isNaN(proposedScheduledAt.getTime())) return { ok: false, error: "Invalid date/time." };
    proposedOutcome = SCHEDULING_OUTCOME_LABEL[actionType]!;
  } else {
    proposedOutcome = String(formData.get("proposedOutcome") ?? "").trim();
    if (!proposedOutcome) return { ok: false, error: "Describe the exact proposed outcome/terms." };
  }
  if (actionType === "SEND_MESSAGE" && (!recipientEmail || !messageText)) {
    return { ok: false, error: "An outbound message request needs the exact recipient and final text." };
  }

  // Never route to an arbitrary user — require an owner-configured manager
  // before a submission can even be attempted.
  const requester = await prisma.user.findUnique({ where: { id: session.sub }, select: { approvalManagerId: true } });
  if (!requester?.approvalManagerId) {
    return { ok: false, error: "No approval manager is set up for your account yet — ask the owner to configure one on the Permissions screen." };
  }
  const manager = await prisma.user.findUnique({
    where: { id: requester.approvalManagerId },
    select: { id: true, active: true, role: true },
  });
  if (!manager || !manager.active || (manager.role !== "ADMIN" && manager.role !== "SERVICE_MANAGER")) {
    return { ok: false, error: "Your configured approval manager is no longer valid — ask the owner to update it." };
  }

  const applicant = await prisma.applicant.findUnique({ where: { id: applicantId }, select: { stage: true } });
  if (!applicant) return { ok: false, error: "Applicant not found." };

  try {
    const request = await prisma.approvalRequest.create({
      data: {
        requesterId: session.sub,
        managerId: manager.id,
        applicantId,
        actionType,
        rationale,
        proposedOutcome,
        recipientEmail,
        messageText,
        proposedScheduledAt,
        applicantStageAtRequest: applicant.stage,
      },
    });

    await logAudit({
      actorId: getTrueActorId(session),
      action: "APPROVAL_SUBMITTED",
      recordType: "ApprovalRequest",
      recordId: request.id,
      changedFields: { actionType: { to: actionType }, applicantId: { to: applicantId } },
    });

    revalidatePath(`/recruiting/applicants/${applicantId}`);
    revalidatePath("/recruiting/approvals");
    return { ok: true };
  } catch (err) {
    // The partial unique index (applicantId, actionType) WHERE status =
    // 'PENDING' rejects a second pending request for the same
    // applicant+action — surfaced as a plain, expected error, not a crash.
    if (err instanceof Error && err.message.includes("ApprovalRequest_one_pending_per_applicant_action")) {
      return { ok: false, error: "There's already a pending request for this applicant and action." };
    }
    throw err;
  }
}

export async function withdrawApprovalRequestAction(requestId: string): Promise<ApprovalActionResult> {
  const { session } = await assertAreaAccess("RECRUITING", { edit: true });

  const updated = await prisma.approvalRequest.updateMany({
    where: { id: requestId, requesterId: session.sub, status: "PENDING" },
    data: { status: "WITHDRAWN" },
  });
  if (updated.count === 0) return { ok: false, error: "Nothing to withdraw — it may already be decided." };

  await logAudit({
    actorId: getTrueActorId(session),
    action: "APPROVAL_WITHDRAWN",
    recordType: "ApprovalRequest",
    recordId: requestId,
  });
  revalidatePath("/recruiting/approvals");
  return { ok: true };
}

// Manager-side: approve or decline. This only ever records a decision —
// see markApprovalExecutedAction for the separate, later, explicit manual
// step. Re-verifies the record hasn't moved since submission, and that the
// decider is still both the configured manager AND someone with real
// recruiting decision authority (role), not just whoever clicked the button.
export async function decideApprovalRequestAction(
  requestId: string,
  decision: "APPROVED" | "DECLINED",
  decisionNote: string,
  // SCHEDULE_IN_PERSON_INTERVIEW/SCHEDULE_WORKING_SESSION only — the
  // manager's edited date/time, as a datetime-local string. Omitted (or
  // blank) means "approve exactly what was proposed," never a silent
  // change: decidedScheduledAt is explicitly set to request.proposedScheduledAt
  // in that case, so the final reviewed details are always on record even
  // when nothing was edited.
  decidedScheduledAtRaw?: string
): Promise<ApprovalActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authorized." };
  if (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER") {
    return { ok: false, error: "Not authorized to decide approval requests." };
  }

  const request = await prisma.approvalRequest.findUnique({
    where: { id: requestId },
    include: { applicant: { select: { stage: true } }, requester: { select: { approvalManagerId: true } } },
  });
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "PENDING") return { ok: false, error: "This request was already decided or withdrawn." };

  // Self-approval is impossible by construction (the requester is never
  // the manager — assertAreaAccess only grants RECRUITING edit to Office
  // Assistant, never ADMIN/SERVICE_MANAGER authority), but guard explicitly
  // anyway rather than relying on that invariant alone.
  if (request.requesterId === session.sub) {
    return { ok: false, error: "You can't decide your own request." };
  }
  // Must still be the currently-configured manager for this requester —
  // routing may have changed since submission.
  if (request.managerId !== session.sub || request.requester.approvalManagerId !== session.sub) {
    return { ok: false, error: "This request is no longer routed to you." };
  }

  // Stale/conflicting: the applicant's stage moved since this request was
  // written — don't decide against a snapshot that no longer matches.
  if (request.applicant.stage !== request.applicantStageAtRequest) {
    await prisma.approvalRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: "NEEDS_RESUBMISSION" },
    });
    await logAudit({
      actorId: getTrueActorId(session),
      action: "APPROVAL_STALE",
      recordType: "ApprovalRequest",
      recordId: requestId,
      changedFields: { applicantStage: { from: request.applicantStageAtRequest, to: request.applicant.stage } },
    });
    revalidatePath("/recruiting/approvals");
    return { ok: false, error: "The applicant's record changed since this request was submitted — it now needs resubmission." };
  }

  const isScheduling = SCHEDULING_ACTION_TYPES.has(request.actionType);
  let decidedScheduledAt: Date | undefined;
  if (isScheduling && decision === "APPROVED") {
    const raw = decidedScheduledAtRaw?.trim();
    decidedScheduledAt = raw ? zonedTimeToUtc(raw) : request.proposedScheduledAt ?? undefined;
    if (!decidedScheduledAt || Number.isNaN(decidedScheduledAt.getTime())) {
      return { ok: false, error: "Invalid date/time." };
    }
  }

  const updated = await prisma.approvalRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: {
      status: decision,
      decisionNote: decisionNote.trim() || null,
      decidedById: session.sub,
      decidedAt: new Date(),
      ...(decidedScheduledAt ? { decidedScheduledAt } : {}),
    },
  });
  if (updated.count === 0) {
    // Someone else (or a double-click) already decided this between our
    // read above and this write.
    return { ok: false, error: "This request was just decided by someone else." };
  }

  await logAudit({
    actorId: getTrueActorId(session),
    action: "APPROVAL_DECIDED",
    recordType: "ApprovalRequest",
    recordId: requestId,
    changedFields: { status: { to: decision } },
  });

  // Approval and execution are deliberately distinct outcomes — the
  // decision above already succeeded and is never undone by whatever
  // happens next. claimExecutionAttempt's CAS means only this call (never
  // a concurrent decide/retry) executes, exactly once.
  if (isScheduling && decision === "APPROVED" && decidedScheduledAt) {
    const claimed = await claimExecutionAttempt(requestId);
    if (claimed) {
      const result =
        request.actionType === "SCHEDULE_IN_PERSON_INTERVIEW"
          ? await executeApprovedInPersonInterview(
              requestId,
              request.applicantId,
              decidedScheduledAt,
              session.sub,
              request.applicantStageAtRequest
            )
          : await executeApprovedWorkingSession(
              requestId,
              request.applicantId,
              decidedScheduledAt,
              session.sub,
              request.applicantStageAtRequest
            );
      if (result.stale) {
        revalidatePath("/recruiting/approvals");
        revalidatePath(`/recruiting/applicants/${request.applicantId}`);
        return {
          ok: false,
          error: "The applicant's record changed since this request was submitted — it now needs resubmission.",
        };
      }
    }
  }

  revalidatePath("/recruiting/approvals");
  revalidatePath(`/recruiting/applicants/${request.applicantId}`);
  return { ok: true };
}

// Re-attempts execution for an APPROVED scheduling request whose last
// attempt FAILED or PARTIALly succeeded (e.g. a slot conflict that's since
// cleared, or a calendar sync worth retrying as part of a full re-run
// rather than just the applicant page's own narrower "Retry calendar
// sync"). Never re-executes a SUCCEEDED request, and claimExecutionAttempt
// guards against two concurrent retries both running. Optionally carries a
// new date/time — a slot conflict can only ever be resolved by trying a
// different time, since the conflicting time itself never frees up on its
// own.
export async function retryApprovalExecutionAction(
  requestId: string,
  newDecidedScheduledAtRaw?: string
): Promise<ApprovalActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authorized." };

  const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, error: "Request not found." };
  if (!SCHEDULING_ACTION_TYPES.has(request.actionType)) {
    return { ok: false, error: "This request type has no automatic execution to retry." };
  }
  if (request.status !== "APPROVED") return { ok: false, error: "Only an approved request can be retried." };
  if (request.decidedById !== session.sub) return { ok: false, error: "Only the deciding manager can retry this." };
  if (request.executionStatus === "SUCCEEDED") return { ok: false, error: "This already completed successfully." };

  let decidedScheduledAt = request.decidedScheduledAt;
  const raw = newDecidedScheduledAtRaw?.trim();
  if (raw) {
    const parsed = zonedTimeToUtc(raw);
    if (Number.isNaN(parsed.getTime())) return { ok: false, error: "Invalid date/time." };
    decidedScheduledAt = parsed;
    await prisma.approvalRequest.update({ where: { id: requestId }, data: { decidedScheduledAt } });
  }
  if (!decidedScheduledAt) return { ok: false, error: "No approved date/time on file to retry." };

  const claimed = await claimExecutionAttempt(requestId);
  if (!claimed) return { ok: false, error: "A retry is already in progress, or there's nothing to retry." };

  const result =
    request.actionType === "SCHEDULE_IN_PERSON_INTERVIEW"
      ? await executeApprovedInPersonInterview(
          requestId,
          request.applicantId,
          decidedScheduledAt,
          session.sub,
          request.applicantStageAtRequest
        )
      : await executeApprovedWorkingSession(
          requestId,
          request.applicantId,
          decidedScheduledAt,
          session.sub,
          request.applicantStageAtRequest
        );

  revalidatePath("/recruiting/approvals");
  revalidatePath(`/recruiting/applicants/${request.applicantId}`);
  if (result.stale) {
    return {
      ok: false,
      error: "The applicant's record changed since this was approved — it now needs resubmission, not a retry.",
    };
  }
  return { ok: true };
}

// An audit marker only — the manager clicks this after they've personally,
// manually carried out the approved action (the real stage change / send)
// through the normal recruiting UI. Nothing here executes anything.
export async function markApprovalExecutedAction(requestId: string): Promise<ApprovalActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authorized." };

  const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "APPROVED") return { ok: false, error: "Only an approved request can be marked done." };
  if (request.decidedById !== session.sub) return { ok: false, error: "Only the deciding manager can mark this done." };

  const updated = await prisma.approvalRequest.updateMany({
    where: { id: requestId, status: "APPROVED", executedAt: null },
    data: { executedById: session.sub, executedAt: new Date() },
  });
  if (updated.count === 0) return { ok: false, error: "Already marked done." };

  await logAudit({
    actorId: getTrueActorId(session),
    action: "APPROVAL_EXECUTED",
    recordType: "ApprovalRequest",
    recordId: requestId,
  });
  revalidatePath("/recruiting/approvals");
  revalidatePath(`/recruiting/applicants/${request.applicantId}`);
  return { ok: true };
}
