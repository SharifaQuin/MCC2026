"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import {
  claimRequest,
  markMatchedInTcs,
  markTcsUpdated,
  markCustomerInformed,
  setFeeReview,
  setConfirmedResult,
  approveRequest,
  completeRequest,
  declineRequest,
  closeAsWithdrawnOrDuplicate,
  offerOption,
  setOfferOutcome,
  sendStaffMessage,
  addStaffNote,
  revokeStatusToken,
  markMessageNotSent,
  resendFailedMessage,
  setAutoReceiptEnabled,
  type ConfirmedResultInput,
} from "@/lib/rescheduleRequests";
import type { RescheduleFeeReview } from "@prisma/client";

// Every mutation checks canEdit on the server, same as src/app/(portal)/
// sales/leads/actions.ts — canView alone (read the queue) is never enough
// to change anything. No new roles or grants: this is the exact same
// requireDepartmentAccess("SALES") gate the rest of Sales already uses.
async function requireEdit() {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) throw new Error("Not authorized.");
  return session;
}

function refresh() {
  revalidatePath("/sales/reschedules");
  revalidatePath("/sales");
  revalidatePath("/");
}

export async function claimRequestAction(id: string) {
  const session = await requireEdit();
  await claimRequest(id, session.sub);
  refresh();
}

export async function markMatchedInTcsAction(id: string) {
  const session = await requireEdit();
  await markMatchedInTcs(id, session.sub);
  refresh();
}

export async function markTcsUpdatedAction(id: string) {
  const session = await requireEdit();
  await markTcsUpdated(id, session.sub);
  refresh();
}

export async function markCustomerInformedAction(id: string) {
  const session = await requireEdit();
  await markCustomerInformed(id, session.sub);
  refresh();
}

export async function setFeeReviewAction(formData: FormData) {
  const session = await requireEdit();
  const id = String(formData.get("id") ?? "");
  const feeReview = String(formData.get("feeReview") ?? "") as RescheduleFeeReview;
  const note = String(formData.get("feeReviewNote") ?? "");
  await setFeeReview(id, feeReview, note, session.sub);
  refresh();
}

export async function setConfirmedResultAction(formData: FormData) {
  const session = await requireEdit();
  const id = String(formData.get("id") ?? "");
  const input: ConfirmedResultInput = {
    confirmedDate: String(formData.get("confirmedDate") ?? ""),
    confirmedWindow: String(formData.get("confirmedWindow") ?? ""),
    confirmedOriginalOutcome: String(formData.get("confirmedOriginalOutcome") ?? ""),
    confirmedRecurrenceText: String(formData.get("confirmedRecurrenceText") ?? ""),
    confirmedFeeNotice: String(formData.get("confirmedFeeNotice") ?? ""),
  };
  const result = await setConfirmedResult(id, input, session.sub);
  refresh();
  return result;
}

export async function approveRequestAction(id: string) {
  const session = await requireEdit();
  const result = await approveRequest(id, session.sub);
  refresh();
  return result;
}

export async function completeRequestAction(id: string) {
  const session = await requireEdit();
  const result = await completeRequest(id, session.sub);
  refresh();
  return result;
}

export async function declineRequestAction(formData: FormData) {
  const session = await requireEdit();
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "");
  const result = await declineRequest(id, note, session.sub);
  refresh();
  return result;
}

export async function closeWithdrawnAction(formData: FormData) {
  const session = await requireEdit();
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "");
  const result = await closeAsWithdrawnOrDuplicate(id, "WITHDRAWN", note, session.sub);
  refresh();
  return result;
}

export async function closeDuplicateAction(formData: FormData) {
  const session = await requireEdit();
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "");
  const result = await closeAsWithdrawnOrDuplicate(id, "DUPLICATE_OR_INVALID", note, session.sub);
  refresh();
  return result;
}

export async function offerOptionAction(formData: FormData) {
  const session = await requireEdit();
  const id = String(formData.get("id") ?? "");
  const result = await offerOption(
    id,
    { date: String(formData.get("date") ?? ""), block: String(formData.get("block") ?? ""), window: String(formData.get("window") ?? "") },
    String(formData.get("text") ?? ""),
    session.sub
  );
  refresh();
  return result;
}

export async function setOfferOutcomeAction(id: string, outcome: "DECLINED" | "WITHDRAWN") {
  const session = await requireEdit();
  await setOfferOutcome(id, outcome, session.sub);
  refresh();
}

export async function sendStaffMessageAction(formData: FormData) {
  const session = await requireEdit();
  const id = String(formData.get("id") ?? "");
  const channel = (String(formData.get("channel") ?? "EMAIL") as "EMAIL" | "SMS");
  const body = String(formData.get("body") ?? "");
  const result = await sendStaffMessage(id, channel, body, session.sub);
  refresh();
  return result;
}

export async function addStaffNoteAction(formData: FormData) {
  const session = await requireEdit();
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "");
  await addStaffNote(id, body, session.sub);
  refresh();
}

export async function revokeStatusTokenAction(id: string) {
  const session = await requireEdit();
  await revokeStatusToken(id, session.sub);
  refresh();
}

export async function markMessageNotSentAction(messageId: string) {
  const session = await requireEdit();
  await markMessageNotSent(messageId, session.sub);
  refresh();
}

export async function resendFailedMessageAction(messageId: string) {
  const session = await requireEdit();
  await resendFailedMessage(messageId, session.sub);
  refresh();
}

// Owner-only — "nothing is enabled for customers until the owner approves
// the wording."
export async function setAutoReceiptEnabledAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Not authorized.");
  await setAutoReceiptEnabled(formData.get("enabled") === "on");
  revalidatePath("/sales/reschedules");
}
