"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import type { LeadStage, LeadSource } from "@prisma/client";

const VALID_LEAD_SOURCES = new Set(["PHONE_CALL", "WALK_IN", "REFERRAL", "OTHER"]);

export async function setLeadStageAction(leadId: string, stage: LeadStage) {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;

  const current = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      stage,
      ...(stage === "CONTACTED" && !current.firstContactedAt ? { firstContactedAt: new Date() } : {}),
    },
  });
  await prisma.leadStageChange.create({
    data: { leadId, fromStage: current.stage, toStage: stage, changedById: session.sub },
  });

  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales/leads");
  revalidatePath("/sales");
}

export async function markLeadLostAction(leadId: string, lostReason: string) {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;
  const current = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  await prisma.lead.update({
    where: { id: leadId },
    data: { stage: "LOST", lostReason: lostReason.trim() || null },
  });
  await prisma.leadStageChange.create({
    data: { leadId, fromStage: current.stage, toStage: "LOST", changedById: session.sub },
  });
  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales/leads");
  revalidatePath("/sales");
}

// For phone calls, walk-ins, or referrals — added directly by a manager,
// skipping the public website form since it wasn't a website inquiry.
export async function createManualLeadAction(formData: FormData) {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const serviceInterest = String(formData.get("serviceInterest") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const sourceRaw = String(formData.get("source") ?? "");
  const source = VALID_LEAD_SOURCES.has(sourceRaw) ? (sourceRaw as LeadSource) : "PHONE_CALL";

  if (!firstName || !lastName || !email || !phone) return;

  const lead = await prisma.lead.create({
    data: { firstName, lastName, email, phone, serviceInterest, source, stage: "NEW_INQUIRY" },
  });
  if (notes) {
    await prisma.leadNote.create({ data: { leadId: lead.id, authorId: session.sub, body: notes } });
  }

  revalidatePath("/sales/leads");
  redirect(`/sales/leads/${lead.id}`);
}

// Notes are an append-only activity log rather than a single overwritable
// field, so every entry keeps its own timestamp and author.
export async function addLeadNoteAction(leadId: string, formData: FormData) {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await prisma.leadNote.create({ data: { leadId, authorId: session.sub, body } });
  revalidatePath(`/sales/leads/${leadId}`);
}

export async function setLeadDealDetailsAction(leadId: string, formData: FormData) {
  const { canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;
  const estimatedValueRaw = String(formData.get("estimatedValue") ?? "").replace(/[^0-9.]/g, "");
  const estimatedValue = estimatedValueRaw ? parseFloat(estimatedValueRaw) || 0 : null;
  const quoteKey = String(formData.get("quoteKey") ?? "").trim() || null;
  const followUpDateRaw = String(formData.get("followUpDate") ?? "");
  const followUpDueAt = followUpDateRaw ? new Date(followUpDateRaw) : null;

  await prisma.lead.update({
    where: { id: leadId },
    data: { estimatedValue, quoteKey, followUpDueAt },
  });
  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales/leads");
}

export async function sendLeadEmailAction(leadId: string, formData: FormData) {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!subject || !body) return;

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const result = await sendEmail({ to: lead.email, subject, body });

  await prisma.leadCommunication.create({
    data: {
      leadId,
      channel: "EMAIL",
      direction: "OUTBOUND",
      subject,
      body,
      status: result.ok ? "SENT" : "FAILED",
      errorMessage: result.ok ? null : result.error,
      sentById: session.sub,
    },
  });

  revalidatePath(`/sales/leads/${leadId}`);
}

export async function sendLeadTextAction(leadId: string, formData: FormData) {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const result = await sendSms({ to: lead.phone, text: body });

  await prisma.leadCommunication.create({
    data: {
      leadId,
      channel: "SMS",
      direction: "OUTBOUND",
      body,
      status: result.ok ? "SENT" : "FAILED",
      errorMessage: result.ok ? null : result.error,
      sentById: session.sub,
    },
  });

  revalidatePath(`/sales/leads/${leadId}`);
}

// Leads' replies land in the staff member's own inbox/phone, not in our
// system — this lets them manually record what was said so it shows up
// alongside the outbound history instead of living only in Outlook/RingCentral.
export async function logLeadReplyAction(leadId: string, channel: "EMAIL" | "SMS", formData: FormData) {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;
  const subject = channel === "EMAIL" ? String(formData.get("subject") ?? "").trim() || null : null;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  await prisma.leadCommunication.create({
    data: { leadId, channel, direction: "INBOUND", subject, body, sentById: session.sub },
  });

  revalidatePath(`/sales/leads/${leadId}`);
}
