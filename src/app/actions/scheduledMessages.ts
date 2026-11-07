"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { requireRecruitingAccess } from "@/lib/requireRecruitingAccess";
import { zonedTimeToUtc } from "@/lib/timezone";
import { isSmsQuietHours } from "@/lib/scheduledMessages";
import { getTrueActorId } from "@/lib/impersonation";
import type { CommChannel } from "@prisma/client";

export type RecipientType = "LEAD" | "APPLICANT";

export interface ScheduleMessageResult {
  ok: boolean;
  error?: string;
  quietHours?: boolean;
}

// Scheduling uses the exact same authorization boundary as the instant-send
// actions it sits next to (sendLeadEmailAction/sendApplicantEmailAction,
// etc.) — requireDepartmentAccess("SALES").canEdit for a lead,
// requireRecruitingAccess() for an applicant. There is no separate approval
// step on those today to preserve; this is it.
async function authorizeRecipient(
  recipientType: RecipientType,
  recipientId: string
): Promise<{ ok: true; createdById: string } | { ok: false; error: string }> {
  if (recipientType === "LEAD") {
    const { session, canEdit } = await requireDepartmentAccess("SALES");
    if (!canEdit) return { ok: false, error: "Not authorized." };
    const lead = await prisma.lead.findUnique({ where: { id: recipientId }, select: { id: true, stage: true } });
    if (!lead) return { ok: false, error: "Lead not found." };
    // Covers both creating a new scheduled send (scheduleMessageAction
    // calls this directly) and editing an existing one
    // (updateScheduledMessageAction -> authorizeScheduledMessage -> this),
    // checked fresh every time rather than relying solely on the bulk-
    // cancel markLeadScamAction does at classification time — that only
    // covers sends that already existed then, not ones created afterward
    // against an already-classified lead. Cancelling an existing send is
    // NOT blocked here (cancelScheduledMessageAction doesn't call this) —
    // there's no reason to stop someone from cancelling a send to a scam
    // lead.
    if (lead.stage === "SCAM") {
      return { ok: false, error: "This lead is classified as Scam — scheduling a send is blocked." };
    }
    return { ok: true, createdById: getTrueActorId(session) };
  }
  if (recipientType === "APPLICANT") {
    const { session } = await requireRecruitingAccess();
    const applicant = await prisma.applicant.findUnique({ where: { id: recipientId }, select: { id: true } });
    if (!applicant) return { ok: false, error: "Applicant not found." };
    return { ok: true, createdById: getTrueActorId(session) };
  }
  return { ok: false, error: "Invalid recipient type." };
}

export async function scheduleMessageAction(formData: FormData): Promise<ScheduleMessageResult> {
  const recipientType = String(formData.get("recipientType") ?? "") as RecipientType;
  const recipientId = String(formData.get("recipientId") ?? "").trim();
  const channel = String(formData.get("channel") ?? "") as CommChannel;
  const subject = String(formData.get("subject") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();
  const sendAtLocal = String(formData.get("sendAtLocal") ?? "").trim();

  if (!recipientId) return { ok: false, error: "Missing recipient." };
  if (channel !== "EMAIL" && channel !== "SMS") return { ok: false, error: "Invalid channel." };
  if (!body) return { ok: false, error: "Message can't be empty." };
  if (channel === "EMAIL" && !subject) return { ok: false, error: "Subject is required." };
  if (!sendAtLocal) return { ok: false, error: "Pick a date and time." };

  const auth = await authorizeRecipient(recipientType, recipientId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const sendAt = zonedTimeToUtc(sendAtLocal);
  if (sendAt.getTime() <= Date.now()) return { ok: false, error: "Pick a time in the future." };

  await prisma.scheduledMessage.create({
    data: {
      channel,
      leadId: recipientType === "LEAD" ? recipientId : null,
      applicantId: recipientType === "APPLICANT" ? recipientId : null,
      subject,
      body,
      sendAt,
      createdById: auth.createdById,
    },
  });

  revalidatePath("/scheduled");
  if (recipientType === "LEAD") revalidatePath(`/sales/leads/${recipientId}`);
  else revalidatePath(`/recruiting/applicants/${recipientId}`);

  return { ok: true, quietHours: channel === "SMS" && isSmsQuietHours(sendAt) };
}

async function authorizeScheduledMessage(
  id: string
): Promise<{ ok: true; recipientType: RecipientType; recipientId: string } | { ok: false; error: string }> {
  const msg = await prisma.scheduledMessage.findUnique({
    where: { id },
    select: { leadId: true, applicantId: true, status: true },
  });
  if (!msg) return { ok: false, error: "Not found." };
  if (msg.status !== "PENDING") return { ok: false, error: "This message already sent, failed, or was cancelled." };

  const recipientType: RecipientType = msg.leadId ? "LEAD" : "APPLICANT";
  const recipientId = (msg.leadId ?? msg.applicantId)!;
  const auth = await authorizeRecipient(recipientType, recipientId);
  if (!auth.ok) return { ok: false, error: auth.error };
  return { ok: true, recipientType, recipientId };
}

export async function updateScheduledMessageAction(
  id: string,
  formData: FormData
): Promise<ScheduleMessageResult> {
  const auth = await authorizeScheduledMessage(id);
  if (!auth.ok) return { ok: false, error: auth.error };

  const subject = String(formData.get("subject") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();
  const sendAtLocal = String(formData.get("sendAtLocal") ?? "").trim();

  if (!body) return { ok: false, error: "Message can't be empty." };
  if (!sendAtLocal) return { ok: false, error: "Pick a date and time." };

  const sendAt = zonedTimeToUtc(sendAtLocal);
  if (sendAt.getTime() <= Date.now()) return { ok: false, error: "Pick a time in the future." };

  // Guarded again by status here (not just in authorizeScheduledMessage
  // above) so a tick that claimed this row between that check and this
  // write can't have its send clobbered by a stale edit.
  const updated = await prisma.scheduledMessage.updateMany({
    where: { id, status: "PENDING" },
    data: { subject, body, sendAt },
  });
  if (updated.count === 0) return { ok: false, error: "This message already sent, failed, or was cancelled." };

  const msg = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id }, select: { channel: true } });

  revalidatePath("/scheduled");
  if (auth.recipientType === "LEAD") revalidatePath(`/sales/leads/${auth.recipientId}`);
  else revalidatePath(`/recruiting/applicants/${auth.recipientId}`);

  return { ok: true, quietHours: msg.channel === "SMS" && isSmsQuietHours(sendAt) };
}

export async function cancelScheduledMessageAction(id: string): Promise<ScheduleMessageResult> {
  const auth = await authorizeScheduledMessage(id);
  if (!auth.ok) return { ok: false, error: auth.error };

  const cancelled = await prisma.scheduledMessage.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (cancelled.count === 0) return { ok: false, error: "This message already sent, failed, or was cancelled." };

  revalidatePath("/scheduled");
  if (auth.recipientType === "LEAD") revalidatePath(`/sales/leads/${auth.recipientId}`);
  else revalidatePath(`/recruiting/applicants/${auth.recipientId}`);

  return { ok: true };
}
