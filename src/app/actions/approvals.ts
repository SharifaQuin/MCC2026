"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { assertAreaAccess } from "@/lib/officeAssistant";
import { logAudit } from "@/lib/auditLog";
import type { ApprovalActionType } from "@prisma/client";

// Limited to recruiting decisions/offers and their messages for this first
// version — never expand this set to payroll, discounts, account access,
// or anything else without a fresh design pass.
const VALID_ACTION_TYPES = new Set<ApprovalActionType>(["REJECT_APPLICANT", "OFFER_APPLICANT", "SEND_MESSAGE"]);

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
  const proposedOutcome = String(formData.get("proposedOutcome") ?? "").trim();
  const recipientEmail = String(formData.get("recipientEmail") ?? "").trim() || null;
  const messageText = String(formData.get("messageText") ?? "").trim() || null;

  if (!applicantId) return { ok: false, error: "Missing applicant." };
  if (!VALID_ACTION_TYPES.has(actionTypeRaw as ApprovalActionType)) return { ok: false, error: "Invalid action type." };
  const actionType = actionTypeRaw as ApprovalActionType;
  if (!rationale) return { ok: false, error: "Explain why you're requesting this." };
  if (!proposedOutcome) return { ok: false, error: "Describe the exact proposed outcome/terms." };
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
        applicantStageAtRequest: applicant.stage,
      },
    });

    await logAudit({
      actorId: session.sub,
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

  await logAudit({ actorId: session.sub, action: "APPROVAL_WITHDRAWN", recordType: "ApprovalRequest", recordId: requestId });
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
  decisionNote: string
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
      actorId: session.sub,
      action: "APPROVAL_STALE",
      recordType: "ApprovalRequest",
      recordId: requestId,
      changedFields: { applicantStage: { from: request.applicantStageAtRequest, to: request.applicant.stage } },
    });
    revalidatePath("/recruiting/approvals");
    return { ok: false, error: "The applicant's record changed since this request was submitted — it now needs resubmission." };
  }

  const updated = await prisma.approvalRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: decision, decisionNote: decisionNote.trim() || null, decidedById: session.sub, decidedAt: new Date() },
  });
  if (updated.count === 0) {
    // Someone else (or a double-click) already decided this between our
    // read above and this write.
    return { ok: false, error: "This request was just decided by someone else." };
  }

  await logAudit({
    actorId: session.sub,
    action: "APPROVAL_DECIDED",
    recordType: "ApprovalRequest",
    recordId: requestId,
    changedFields: { status: { to: decision } },
  });

  revalidatePath("/recruiting/approvals");
  revalidatePath(`/recruiting/applicants/${request.applicantId}`);
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

  await logAudit({ actorId: session.sub, action: "APPROVAL_EXECUTED", recordType: "ApprovalRequest", recordId: requestId });
  revalidatePath("/recruiting/approvals");
  revalidatePath(`/recruiting/applicants/${request.applicantId}`);
  return { ok: true };
}
