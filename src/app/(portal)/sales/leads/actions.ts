"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { assertSalesLeadsEditAccess, assertLeadContactEditAccess } from "@/lib/requireSalesLeadsAccess";
import { getSession } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { syncQuoteStatusForLead } from "@/lib/leads";
import { logAudit } from "@/lib/auditLog";
import { getTrueActorId } from "@/lib/impersonation";
import { formatPhone, normalizePhoneDigits } from "@/lib/formatPhone";
import type { LeadStage, LeadSource } from "@prisma/client";

const VALID_LEAD_SOURCES = new Set(["PHONE_CALL", "WALK_IN", "REFERRAL", "OTHER"]);

export interface LeadContactInfoFormState {
  error?: string;
  success?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Inline email/phone correction for lead records — office-wide (including
// a view-only Office Assistant like Pedro; see assertLeadContactEditAccess),
// not a general Sales edit grant. Mirrors
// updateApplicantContactInfoAction's exact safeguards (validate only
// changed fields, detect normalized duplicates/no-ops, atomic save +
// actor-history note, warn-don't-block on an associated quote) — made
// symmetric here: BOTH email and phone skip their own validation when
// unchanged (the applicant version only ever did this for phone), so an
// email-only correction can never fail on an untouched, already-bad
// legacy phone number, and a phone-only correction can never fail on an
// untouched, already-invalid legacy email. Never touches stage,
// assignment, quoteKey, or sends anything — a correction here is never a
// follow-up action.
export async function updateLeadContactInfoAction(
  leadId: string,
  _prevState: LeadContactInfoFormState,
  formData: FormData
): Promise<LeadContactInfoFormState> {
  const session = await assertLeadContactEditAccess();

  const emailRaw = String(formData.get("email") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { error: "Lead not found." };

  const submittedEmail = emailRaw.toLowerCase();
  const emailUnchanged = submittedEmail.length > 0 && submittedEmail === lead.email.toLowerCase();
  let email: string;
  if (emailUnchanged) {
    email = lead.email;
  } else {
    if (!submittedEmail || !EMAIL_PATTERN.test(submittedEmail)) {
      return { error: "Enter a valid email address." };
    }
    email = submittedEmail;
  }

  // Same digit-set comparison updateApplicantContactInfoAction already
  // uses — a resubmission of the lead's own current number, however it
  // was originally stored (punctuation, a leading "1"), is never treated
  // as a change, so this field's 10-digit rule is only ever enforced on a
  // genuinely changing value.
  const submittedPhoneDigits = normalizePhoneDigits(phoneRaw);
  const storedPhoneDigits = normalizePhoneDigits(lead.phone);
  const phoneUnchanged =
    submittedPhoneDigits.size > 0 && [...submittedPhoneDigits].some((d) => storedPhoneDigits.has(d));

  let phone: string;
  if (phoneUnchanged) {
    phone = lead.phone;
  } else {
    const digits = phoneRaw.replace(/\D/g, "");
    phone = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (phone.length !== 10) {
      return { error: "Enter a valid 10-digit phone number." };
    }
  }

  // Scoped across every lead, not just this one — reusing another lead's
  // email/phone would conflate two different people's communication
  // threads/history.
  if (!emailUnchanged) {
    const conflict = await prisma.lead.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, id: { not: leadId } },
      select: { id: true },
    });
    if (conflict) return { error: "Another lead already uses this email address." };
  }
  if (!phoneUnchanged) {
    const otherLeads = await prisma.lead.findMany({ where: { id: { not: leadId } }, select: { id: true, phone: true } });
    const newPhoneDigits = normalizePhoneDigits(phone);
    const conflict = otherLeads.find((other) =>
      [...normalizePhoneDigits(other.phone)].some((d) => newPhoneDigits.has(d))
    );
    if (conflict) return { error: "Another lead already uses this phone number." };
  }

  const changeLines: string[] = [];
  if (!emailUnchanged && email !== lead.email) {
    changeLines.push(`Email changed from ${lead.email} to ${email}`);
  }
  if (!phoneUnchanged) {
    changeLines.push(`Phone changed from ${formatPhone(lead.phone)} to ${formatPhone(phone)}`);
  }
  if (changeLines.length === 0) {
    return { success: true };
  }

  // A quote was generated against this lead's current contact details
  // (quoteKey — see src/lib/leads.ts) — this correction never alters or
  // regenerates it, just flags that it won't reflect a changed address
  // going forward.
  if (lead.quoteKey) {
    changeLines.push("Note: this lead has a saved quote that was NOT regenerated — it may still show the previous contact details.");
  }

  await prisma.$transaction([
    prisma.lead.update({ where: { id: leadId }, data: { email, phone } }),
    prisma.leadNote.create({
      data: { leadId, authorId: getTrueActorId(session), body: changeLines.join("\n") },
    }),
  ]);

  revalidatePath(`/sales/leads/${leadId}`);
  return { success: true };
}

// Office Assistant may only record that an inquiry was contacted — moving a
// lead to Quoted or Won means pricing/booking confirmation, which stays
// manager-only; marking Lost (a judgment call, not a factual contact
// status) goes through markLeadLostAction's own, separate block below.
//
// Also the single place every "routine" stage-change caller — any role —
// is blocked from touching Scam: neither setting a lead TO Scam (that's
// markLeadScamAction's job, with its confirm/audit/pending-send-cancel)
// nor moving a lead that's currently Scam to anything else (that's
// restoreLeadFromScamAction's job, which derives the correct prior stage
// from history instead of trusting whatever this call was asked for).
// This is a fast, clear rejection before any DB write; setLeadStageAction's
// own atomic updateMany below is what actually closes the race against a
// concurrent classification, this is just the friendly first layer.
function assertRoutineLeadStageTransition(role: string, stage: LeadStage, currentStage: LeadStage) {
  if (stage === "SCAM") {
    throw new Error("Use the Mark as Scam action to classify a lead as Scam.");
  }
  if (currentStage === "SCAM") {
    throw new Error("This lead is classified as Scam — use Restore to change its stage.");
  }
  if (role === "OFFICE_ASSISTANT" && stage !== "CONTACTED") {
    throw new Error("This stage change needs the authorized manager.");
  }
}

export async function setLeadStageAction(leadId: string, stage: LeadStage) {
  const session = await assertSalesLeadsEditAccess();
  const current = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  assertRoutineLeadStageTransition(session.role, stage, current.stage);

  // Atomic guard against the race assertRoutineLeadStageTransition's read-
  // before-write can't close on its own: the `stage: { not: "SCAM" }`
  // condition is evaluated by the database at write time, not from the
  // `current` read above, so a lead classified Scam by a concurrent
  // request after that read (but before this write) still can't be moved.
  const updated = await prisma.lead.updateMany({
    where: { id: leadId, stage: { not: "SCAM" } },
    data: {
      stage,
      ...(stage === "CONTACTED" && !current.firstContactedAt ? { firstContactedAt: new Date() } : {}),
    },
  });
  if (updated.count === 0) {
    throw new Error("This lead is classified as Scam — use Restore to change its stage.");
  }
  await prisma.leadStageChange.create({
    data: { leadId, fromStage: current.stage, toStage: stage, changedById: getTrueActorId(session) },
  });
  if (stage === "WON") await syncQuoteStatusForLead(current.quoteKey, "won");
  if (session.role === "OFFICE_ASSISTANT") {
    await logAudit({
      actorId: getTrueActorId(session),
      action: "LEAD_STAGE_CHANGED",
      recordType: "Lead",
      recordId: leadId,
      changedFields: { stage: { from: current.stage, to: stage } },
    });
  }

  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales/leads");
  revalidatePath("/sales");
}

export async function markLeadLostAction(leadId: string, lostReason: string) {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;
  // Office Assistant never reaches here (requireDepartmentAccess("SALES")
  // always denies this role — see src/lib/departments.ts), but guard
  // explicitly anyway: marking a lead Lost is a business judgment call,
  // not a factual contact status this role may record on its own.
  if (session.role === "OFFICE_ASSISTANT") throw new Error("Not authorized.");
  const current = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (current.stage === "SCAM") {
    throw new Error("This lead is classified as Scam — use Restore to change its stage.");
  }
  // Same atomic race-guard as setLeadStageAction above: evaluated at write
  // time, not from the `current` read, so a concurrent Scam classification
  // can't be silently clobbered by this call.
  const updated = await prisma.lead.updateMany({
    where: { id: leadId, stage: { not: "SCAM" } },
    data: { stage: "LOST", lostReason: lostReason.trim() || null },
  });
  if (updated.count === 0) {
    throw new Error("This lead is classified as Scam — use Restore to change its stage.");
  }
  await prisma.leadStageChange.create({
    data: { leadId, fromStage: current.stage, toStage: "LOST", changedById: getTrueActorId(session) },
  });
  await syncQuoteStatusForLead(current.quoteKey, "lost");
  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales/leads");
  revalidatePath("/sales");
}

export interface MarkLeadScamResult {
  ok: boolean;
  error?: string;
}

// Thrown only for an expected, user-facing refusal from inside a
// $transaction callback below — distinguishes "the business rule said no"
// (roll back, return a clean {ok:false, error}) from a genuine unexpected
// error (roll back too, but rethrow so it surfaces as a real failure).
class ScamActionRefusal extends Error {}

// Mirrors markLeadLostAction's shape, plus the extra protections the owner
// explicitly asked for that Lost itself doesn't have: a stale-write check
// (Lost has none today — deliberately not touched here, out of scope) and
// an explicit refusal to convert an already-WON lead or a lead with an
// active confirmed booking, since nothing server-side stops either today
// (LeadStageControls' NEXT_STAGES map is UI-only, and a booking's own
// status can drift from the lead's stage). expectedUpdatedAt must be the
// ISO string of the lead's updatedAt as last read by the caller.
//
// Everything below runs inside ONE interactive transaction: the stale-
// write/WON/booking checks and the actual stage write are not separate
// read-then-write steps — the write itself is the only thing that decides
// whether this succeeds (`updateMany`'s `where` is evaluated by the
// database at write time, never from an earlier read), and a thrown
// refusal rolls back every write made so far in this call automatically.
// Two concurrent calls with the same expectedUpdatedAt can't both succeed:
// only one `updateMany` can match the stale `updatedAt`/`stage` condition.
export async function markLeadScamAction(
  leadId: string,
  expectedUpdatedAt: string,
  reason?: string
): Promise<MarkLeadScamResult> {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return { ok: false, error: "Not authorized." };
  // Office Assistant never reaches here (requireDepartmentAccess("SALES")
  // always denies this role — see src/lib/departments.ts), but guard
  // explicitly anyway: marking a lead Scam is a business judgment call, not
  // a factual contact status this role may record on its own.
  if (session.role === "OFFICE_ASSISTANT") throw new Error("Not authorized.");

  const actorId = getTrueActorId(session);
  const trimmedReason = reason?.trim() || null;

  try {
    await prisma.$transaction(async (tx) => {
      // Read-only refusal, not an automatic financial change: a booking
      // already confirmed for this lead needs a human to look at it before
      // anyone reclassifies the lead that owns it — never cancel/touch the
      // booking itself here.
      const confirmedBooking = await tx.slotBooking.findFirst({
        where: { leadId, status: "CONFIRMED" },
        select: { id: true },
      });
      if (confirmedBooking) {
        throw new ScamActionRefusal(
          "This lead has an active confirmed booking — needs manual review before reclassifying as Scam."
        );
      }

      // Only for producing the friendlier of two error messages below —
      // the ACTUAL guard against a concurrent change is the atomic
      // updateMany's own where clause, not this read.
      const current = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
      if (current.stage === "WON") {
        throw new ScamActionRefusal(
          "This lead is already Won — an already-booked job needs manual review, not an automatic reclassification. Contact the owner."
        );
      }

      const updated = await tx.lead.updateMany({
        where: { id: leadId, updatedAt: new Date(expectedUpdatedAt), stage: { notIn: ["SCAM", "WON"] } },
        data: { stage: "SCAM", scamReason: trimmedReason },
      });
      if (updated.count !== 1) {
        throw new ScamActionRefusal("This lead changed since you loaded it — reload the page and try again.");
      }

      await tx.leadStageChange.create({
        data: { leadId, fromStage: current.stage, toStage: "SCAM", changedById: actorId },
      });
      await tx.auditLogEntry.create({
        data: {
          actorId,
          action: "LEAD_MARKED_SCAM",
          recordType: "Lead",
          recordId: leadId,
          changedFields: { fromStage: { from: current.stage, to: "SCAM" }, reason: { from: null, to: trimmedReason } },
        },
      });

      // Bulk-cancel every pending scheduled send for this lead — a scam
      // contact should never still get a follow-up text/email queued up
      // after this. This can't intercept a row the 60s-interval scheduler
      // already claimed into SENDING in the exact instant before this
      // transaction commits — closed separately in
      // scheduledMessageScheduler.ts's own pre-transport stage check, which
      // narrows (but can't fully eliminate) that window. SENT/FAILED
      // history is untouched either way.
      await tx.scheduledMessage.updateMany({
        where: { leadId, status: "PENDING" },
        data: { status: "CANCELLED", cancelReason: "Lead marked Scam" },
      });
    });
  } catch (err) {
    if (err instanceof ScamActionRefusal) return { ok: false, error: err.message };
    throw err;
  }

  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales/leads");
  revalidatePath("/sales/leads/scam");
  revalidatePath("/sales");
  revalidatePath("/scheduled");
  return { ok: true };
}

export interface RestoreLeadFromScamResult {
  ok: boolean;
  error?: string;
}

// The prior stage is read from this lead's own stage-change history (the
// most recent row whose toStage is SCAM) rather than a new field — that
// history already exists and is the single source of truth for "what was
// this lead before it got classified." Never auto-resends anything the
// Scam action cancelled; restoring only ever changes stage/scamReason.
// Same atomic-transaction shape as markLeadScamAction above, for the same
// concurrent-request reasons — two simultaneous Restore calls can't both
// succeed, and can't each append a conflicting history row.
export async function restoreLeadFromScamAction(
  leadId: string,
  expectedUpdatedAt: string
): Promise<RestoreLeadFromScamResult> {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return { ok: false, error: "Not authorized." };
  if (session.role === "OFFICE_ASSISTANT") throw new Error("Not authorized.");

  const actorId = getTrueActorId(session);

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
      if (current.stage !== "SCAM") {
        throw new ScamActionRefusal("This lead isn't currently classified as Scam — nothing to restore.");
      }

      const lastScamChange = await tx.leadStageChange.findFirst({
        where: { leadId, toStage: "SCAM" },
        orderBy: { createdAt: "desc" },
      });
      // Refuse rather than guess: no history row at all, or a row whose own
      // fromStage is itself SCAM (a sign of an earlier race/bug corrupting
      // this lead's history), means there's no single true prior stage to
      // restore to.
      if (!lastScamChange || lastScamChange.fromStage === "SCAM" || !lastScamChange.fromStage) {
        throw new ScamActionRefusal(
          "This lead's restoration history is missing or ambiguous — contact the owner for manual review."
        );
      }
      const restoredStage: LeadStage = lastScamChange.fromStage;

      const updated = await tx.lead.updateMany({
        where: { id: leadId, updatedAt: new Date(expectedUpdatedAt), stage: "SCAM" },
        data: { stage: restoredStage, scamReason: null },
      });
      if (updated.count !== 1) {
        throw new ScamActionRefusal("This lead changed since you loaded it — reload the page and try again.");
      }

      await tx.leadStageChange.create({
        data: { leadId, fromStage: "SCAM", toStage: restoredStage, changedById: actorId },
      });
      await tx.auditLogEntry.create({
        data: {
          actorId,
          action: "LEAD_RESTORED_FROM_SCAM",
          recordType: "Lead",
          recordId: leadId,
          changedFields: { fromStage: { from: "SCAM", to: restoredStage } },
        },
      });
    });
  } catch (err) {
    if (err instanceof ScamActionRefusal) return { ok: false, error: err.message };
    throw err;
  }

  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales/leads");
  revalidatePath("/sales/leads/scam");
  revalidatePath("/sales");
  return { ok: true };
}

// For phone calls, walk-ins, or referrals — added directly by a manager,
// skipping the public website form since it wasn't a website inquiry.
export async function createManualLeadAction(formData: FormData) {
  const session = await assertSalesLeadsEditAccess();

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
    await prisma.leadNote.create({ data: { leadId: lead.id, authorId: getTrueActorId(session), body: notes } });
  }
  if (session.role === "OFFICE_ASSISTANT") {
    await logAudit({
      actorId: getTrueActorId(session),
      action: "LEAD_CREATED",
      recordType: "Lead",
      recordId: lead.id,
    });
  }

  revalidatePath("/sales/leads");
  redirect(`/sales/leads/${lead.id}`);
}

// Notes are an append-only activity log rather than a single overwritable
// field, so every entry keeps its own timestamp and author.
export async function addLeadNoteAction(leadId: string, formData: FormData) {
  const session = await assertSalesLeadsEditAccess();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await prisma.leadNote.create({ data: { leadId, authorId: getTrueActorId(session), body } });
  if (session.role === "OFFICE_ASSISTANT") {
    await logAudit({
      actorId: getTrueActorId(session),
      action: "LEAD_NOTE_ADDED",
      recordType: "Lead",
      recordId: leadId,
    });
  }
  revalidatePath(`/sales/leads/${leadId}`);
}

// Office Assistant may only move the follow-up date here — estimatedValue
// and quoteKey are pricing/quote data and stay untouched (and unreadable
// from the form: this role's narrow lead view never renders those fields,
// so there's nothing for its own form to submit back).
export async function setLeadDealDetailsAction(leadId: string, formData: FormData) {
  const session = await assertSalesLeadsEditAccess();
  const followUpDateRaw = String(formData.get("followUpDate") ?? "");
  const followUpDueAt = followUpDateRaw ? new Date(followUpDateRaw) : null;

  if (session.role === "OFFICE_ASSISTANT") {
    await prisma.lead.update({ where: { id: leadId }, data: { followUpDueAt } });
    await logAudit({
      actorId: getTrueActorId(session),
      action: "LEAD_FOLLOWUP_SET",
      recordType: "Lead",
      recordId: leadId,
    });
    revalidatePath(`/sales/leads/${leadId}`);
    revalidatePath("/sales/leads");
    return;
  }

  const estimatedValueRaw = String(formData.get("estimatedValue") ?? "").replace(/[^0-9.]/g, "");
  const estimatedValue = estimatedValueRaw ? parseFloat(estimatedValueRaw) || 0 : null;
  const quoteKey = String(formData.get("quoteKey") ?? "").trim() || null;

  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: { estimatedValue, quoteKey, followUpDueAt },
  });
  if (lead.stage === "WON" || lead.stage === "LOST") {
    await syncQuoteStatusForLead(quoteKey, lead.stage === "WON" ? "won" : "lost");
  }
  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales/leads");
}

export async function sendLeadEmailAction(leadId: string, formData: FormData) {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;
  // Office Assistant never reaches here via requireDepartmentAccess, but
  // guard explicitly: sending an outbound email isn't part of this role's
  // narrow "contact attempts/outcomes" grant (unlike Recruiting, where
  // messaging was explicitly in scope).
  if (session.role === "OFFICE_ASSISTANT") throw new Error("Not authorized.");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!subject || !body) return;

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  // Surfaced the same way a real send failure already is — a FAILED
  // LeadCommunication row with a clear errorMessage, which
  // LeadCommunicationPanel already renders inline. No new error-reporting
  // mechanism, and never a SENT row for a blocked attempt.
  if (lead.stage === "SCAM") {
    await prisma.leadCommunication.create({
      data: {
        leadId,
        channel: "EMAIL",
        direction: "OUTBOUND",
        subject,
        body,
        status: "FAILED",
        errorMessage: "This lead is classified as Scam — sending is blocked.",
        sentById: getTrueActorId(session),
      },
    });
    revalidatePath(`/sales/leads/${leadId}`);
    return;
  }
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
      sentById: getTrueActorId(session),
    },
  });

  revalidatePath(`/sales/leads/${leadId}`);
}

export async function sendLeadTextAction(leadId: string, formData: FormData) {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;
  if (session.role === "OFFICE_ASSISTANT") throw new Error("Not authorized.");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.stage === "SCAM") {
    await prisma.leadCommunication.create({
      data: {
        leadId,
        channel: "SMS",
        direction: "OUTBOUND",
        body,
        status: "FAILED",
        errorMessage: "This lead is classified as Scam — sending is blocked.",
        sentById: getTrueActorId(session),
      },
    });
    revalidatePath(`/sales/leads/${leadId}`);
    return;
  }
  const result = await sendSms({ to: lead.phone, text: body });

  await prisma.leadCommunication.create({
    data: {
      leadId,
      channel: "SMS",
      direction: "OUTBOUND",
      body,
      status: result.ok ? "SENT" : "FAILED",
      errorMessage: result.ok ? null : result.error,
      sentById: getTrueActorId(session),
    },
  });

  revalidatePath(`/sales/leads/${leadId}`);
}

// Leads' replies land in the staff member's own inbox/phone, not in our
// system — this lets them manually record what was said so it shows up
// alongside the outbound history instead of living only in Outlook/RingCentral.
export async function logLeadReplyAction(leadId: string, channel: "EMAIL" | "SMS", formData: FormData) {
  const session = await assertSalesLeadsEditAccess();
  const subject = channel === "EMAIL" ? String(formData.get("subject") ?? "").trim() || null : null;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  await prisma.leadCommunication.create({
    data: { leadId, channel, direction: "INBOUND", subject, body, sentById: getTrueActorId(session) },
  });
  if (session.role === "OFFICE_ASSISTANT") {
    await logAudit({
      actorId: getTrueActorId(session),
      action: "LEAD_REPLY_LOGGED",
      recordType: "Lead",
      recordId: leadId,
    });
  }

  revalidatePath(`/sales/leads/${leadId}`);
}

// Reassigning ownership of a lead is not part of Office Assistant's narrow
// grant — "owner" is a field this role only ever reads (see the Callback
// Queue description), not changes.
// Free-text callback note (e.g. "Spoke Spanish, confirmed fluent") — low-
// sensitivity metadata, so any Sales editor may set it, same as a lead note.
export async function setLeadLanguageNoteAction(leadId: string, languageNote: string) {
  const session = await assertSalesLeadsEditAccess();
  await prisma.lead.update({ where: { id: leadId }, data: { languageNote: languageNote.trim() || null } });
  if (session.role === "OFFICE_ASSISTANT") {
    await logAudit({
      actorId: getTrueActorId(session),
      action: "LEAD_LANGUAGE_NOTE_SET",
      recordType: "Lead",
      recordId: leadId,
    });
  }
  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales/leads");
}

export async function setLeadAssignmentAction(leadId: string, assignedToId: string) {
  const { session, canEdit } = await requireDepartmentAccess("SALES");
  if (!canEdit) return;
  if (session.role === "OFFICE_ASSISTANT") throw new Error("Not authorized.");
  await prisma.lead.update({
    where: { id: leadId },
    data: { assignedToId: assignedToId || null },
  });
  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales/leads");
}
