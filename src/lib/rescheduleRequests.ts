// Customer-requested moves and skips, submitted ONLY through the public
// /reschedule form (never a call/text/email — see the form page's own
// copy). Every request is a request, never an approval or a reservation:
// the customer's current TCS appointment is untouched until staff act, and
// there is no TCS integration anywhere in this file — staff update TCS by
// hand and record that they did (see markTcsUpdated).
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { businessDateKey, businessTimeParts } from "@/lib/timezone";
import { businessMinutesElapsed, getBusinessHours } from "@/lib/businessHours";
import { sendEmail } from "@/lib/email";
import { DEFAULT_SENDERS, type MessageSenders } from "@/lib/messageSenders";
import type {
  RescheduleArrivalWindow,
  RescheduleCloseOutcome,
  RescheduleDecision,
  RescheduleFeeReview,
  RescheduleFrequency,
  RescheduleRequest,
  RescheduleType,
  RescheduleWorkStatus,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Published fee/rate terms — shown identically to every customer, before
// submit, copied verbatim from
// https://mamascleaningcrew.com/policies-guidelines/'s "Cancellation &
// Schedule Changes" and "Skip Service Policy" sections, with ONLY the
// sentence about reaching the office by reply/text/call/email replaced by
// TERMS_CONTACT_SENTENCE below. Nothing in this file infers, computes, or
// guesses at a fee, a notice period, or a rate change — every figure here is
// the source's own published text, not derived.
export const TERMS_SOURCE_URL = "https://mamascleaningcrew.com/policies-guidelines/";
export const TERMS_DATE_READ = "2026-11-24";
export const TERMS_CONTACT_SENTENCE =
  "Moves and skips are requested through this form. To pause or end service, please call or email us.";
export const TERMS_TEXT = `Cancellation & Schedule Changes

Life happens, and we know plans can change! Here’s what you need to know about canceling or changing your appointment:

Notify us at least 2 business days (48 hours) before your cleaning to avoid a fee. Moves and skips are requested through this form. To pause or end service, please call or email us.
If you cancel or reschedule 1 business day before: a $50 fee will apply.
If you cancel the same day: you’ll be charged 100% of your cleaning fee. This is because we won’t have time to fill your spot, and it affects our employees’ income.
For Friday or weekend cancellations: If you cancel on Friday for a Monday cleaning, a $50 fee applies because our office is closed over the weekend. If you cancel after hours on Friday or over the weekend, the same-day cancellation fee (50%) will apply.
Skips : If you skip a reoccurring appointment a $50 dollar fee will be added to your next cleaning.
Reschedules : If you reschedule an appointment less than 48 hours before your appointment a $50 dollar fee will apply. If you reschedule less than 24 hours this will be considered a cancelation and all same day cancelation fees will apply.

(We don’t love collecting extra fees, but they help ensure our hardworking technicians get paid for lost hours when appointments are missed or changed. We appreciate your understanding and support in keeping their income reliable!)

Skip Service Policy: Keeping It Consistent

If you’re a routine customer and need to reschedule, your next cleaning will be charged at the appropriate frequency rate:

Example: If you’re on a bi-weekly plan but skip a cleaning, your next service will be charged at the monthly rate to account for extra buildup.

Our discounted routine rates are based on regular maintenance. If your service is paused for more than six weeks, the discounted rate no longer applies. You’ll need to book a one-time deep clean before resuming routine service.

For monthly customers: We recommend rescheduling within two weeks of your original date to avoid requiring another deep clean. If we’re unavailable within that timeframe, we’ll handle it case by case.`;

// ---------------------------------------------------------------------------
// Labels — plain display strings, never used for any computation.
export const TYPE_LABELS: Record<RescheduleType, string> = {
  MOVE_KEEP_SCHEDULE: "Move my cleaning, keep my regular schedule",
  MOVE_AND_RESTART: "Move my cleaning and restart my schedule from the new date",
  SKIP_ONE: "Skip this one cleaning",
};

export const ARRIVAL_WINDOW_LABELS: Record<RescheduleArrivalWindow, string> = {
  WINDOW_830_930: "8:30-9:30 AM",
  WINDOW_800_1130: "8:00-11:30 AM",
  WINDOW_1030_130: "10:30 AM-1:30 PM",
  WINDOW_1200_230: "12:00-2:30 PM",
  FLEXIBLE: "Flexible",
};

export const FREQUENCY_LABELS: Record<RescheduleFrequency, string> = {
  WEEKLY: "Weekly",
  EVERY_2_WEEKS: "Every 2 weeks",
  EVERY_4_WEEKS: "Every 4 weeks",
  MONTHLY: "Monthly",
  NOT_SURE: "Not sure",
  OTHER: "Other",
};

export const WORK_STATUS_LABELS: Record<RescheduleWorkStatus, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  WAITING_ON_CUSTOMER: "Waiting on customer",
  CLOSED: "Closed",
};

export const DECISION_LABELS: Record<RescheduleDecision, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Declined",
};

export const CLOSE_OUTCOME_LABELS: Record<RescheduleCloseOutcome, string> = {
  COMPLETED: "Completed",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
  DUPLICATE_OR_INVALID: "Duplicate or invalid",
};

export const FEE_REVIEW_LABELS: Record<RescheduleFeeReview, string> = {
  NOT_DECIDED: "Not decided yet",
  NO_FEE: "No fee applies",
  FEE_APPLIES: "Fee applies",
};

const VALID_TYPES = new Set(["MOVE_KEEP_SCHEDULE", "MOVE_AND_RESTART", "SKIP_ONE"]);
const VALID_ARRIVAL_WINDOWS = new Set(["WINDOW_830_930", "WINDOW_800_1130", "WINDOW_1030_130", "WINDOW_1200_230", "FLEXIBLE"]);
const VALID_FREQUENCIES = new Set(["WEEKLY", "EVERY_2_WEEKS", "EVERY_4_WEEKS", "MONTHLY", "NOT_SURE", "OTHER"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A calendar date's Y/M/D, rejecting anything JS's Date would otherwise
// silently roll over into a different, valid-looking date (e.g.
// "2026-02-30" normalizing into March 2) — same guard as
// salesRevenueSnapshot.ts's own parseExactCalendarDate. Deliberately does
// NOT reject a past date — a past or otherwise odd appointment date is
// accepted and flagged for staff, never rejected outright.
export function parseExactCalendarDate(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

// A request's currentAppointmentDate is "odd" if it's in the past (relative
// to the business-timezone calendar day) or more than a year out either
// way — a flag for staff review, never a rejection reason.
export function isOddAppointmentDate(currentAppointmentDate: Date, now: Date = new Date()): boolean {
  const todayUtc = new Date(`${businessDateKey(now)}T00:00:00Z`);
  const diffDays = (currentAppointmentDate.getTime() - todayUtc.getTime()) / 86400000;
  return diffDays < 0 || diffDays > 365;
}

export interface RawRescheduleInput {
  name: string;
  email: string;
  phone: string;
  address: string;
  note: string;
  currentAppointmentDate: string; // "YYYY-MM-DD"
  type: string;
  arrivalWindow: string; // ignored/blank for SKIP_ONE
  frequency: string; // required only for MOVE_AND_RESTART
  chosenOptionDate: string; // "" if choosing a preferred date/free text instead
  chosenOptionBlock: string;
  chosenOptionFeedMonthId: string;
  preferredDateText: string;
}

export type CreateRescheduleResult =
  | { ok: true; id: string; statusToken: string; type: RescheduleType; currentAppointmentDate: Date }
  | { ok: false; error: string };

// 128-bit random token, returned to the caller exactly once — only its
// sha256 hash is ever stored or looked up. Exported so the status-page
// lookup and tests can hash a candidate token the same way.
export function generateStatusToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function hashStatusToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Every field is server-validated from scratch — a public, unauthenticated
// form. Nothing here is coerced to a fallback: a blank/malformed required
// field is refused outright. Only type-specific fields are read/stored for
// the submitted type; irrelevant fields for that type are never stored even
// if present in the raw input.
export async function createRescheduleRequest(
  input: RawRescheduleInput,
  now: Date = new Date()
): Promise<CreateRescheduleResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  const email = input.email.trim();
  if (!email || !EMAIL_PATTERN.test(email)) return { ok: false, error: "Enter a valid email address." };

  const phone = input.phone.trim() || null;
  const address = input.address.trim() || null;
  const note = input.note.trim() || null;

  const currentAppointmentDateRaw = input.currentAppointmentDate.trim();
  if (!currentAppointmentDateRaw) return { ok: false, error: "Your current appointment date is required." };
  const currentAppointmentDate = parseExactCalendarDate(currentAppointmentDateRaw);
  if (!currentAppointmentDate) return { ok: false, error: "Enter a real calendar date." };

  const typeRaw = input.type.trim();
  if (!VALID_TYPES.has(typeRaw)) return { ok: false, error: "Choose what you'd like to do." };
  const type = typeRaw as RescheduleType;

  let arrivalWindow: RescheduleArrivalWindow | null = null;
  let frequency: RescheduleFrequency | null = null;
  let chosenOptionDate: Date | null = null;
  let chosenOptionBlock: string | null = null;
  let chosenOptionWindow: string | null = null;
  let chosenOptionFeedMonthId: string | null = null;
  let chosenOptionSnapshotTeamsOpen: number | null = null;
  let preferredDateText: string | null = null;

  if (type !== "SKIP_ONE") {
    const arrivalWindowRaw = input.arrivalWindow.trim();
    if (!VALID_ARRIVAL_WINDOWS.has(arrivalWindowRaw)) {
      return { ok: false, error: "Choose an arrival window preference." };
    }
    arrivalWindow = arrivalWindowRaw as RescheduleArrivalWindow;

    if (type === "MOVE_AND_RESTART") {
      const frequencyRaw = input.frequency.trim();
      if (!VALID_FREQUENCIES.has(frequencyRaw)) return { ok: false, error: "Choose your cleaning frequency." };
      frequency = frequencyRaw as RescheduleFrequency;
    }

    const chosenDateRaw = input.chosenOptionDate.trim();
    const preferredTextRaw = input.preferredDateText.trim();
    if (chosenDateRaw) {
      chosenOptionDate = parseExactCalendarDate(chosenDateRaw);
      if (!chosenOptionDate) return { ok: false, error: "The selected option's date is invalid." };
      chosenOptionBlock = input.chosenOptionBlock.trim() || null;
      chosenOptionFeedMonthId = input.chosenOptionFeedMonthId.trim() || null;
      // Both derived server-side, never trusted from (or sent to) the
      // public client — see getCurrentTeamsOpen's and
      // getBlockWindowsSnapshot's own comments. The customer only ever
      // chose a (date, block); any underlying feed window is staff-only
      // context captured here, never shown back to them.
      if (chosenOptionFeedMonthId && chosenOptionBlock) {
        const { getCurrentTeamsOpen, getBlockWindowsSnapshot } = await import("@/lib/slotCapacitySummary");
        chosenOptionSnapshotTeamsOpen = await getCurrentTeamsOpen(chosenOptionFeedMonthId, chosenDateRaw, chosenOptionBlock, now);
        chosenOptionWindow = await getBlockWindowsSnapshot(chosenOptionFeedMonthId, chosenDateRaw, chosenOptionBlock);
      }
    } else if (preferredTextRaw) {
      preferredDateText = preferredTextRaw;
    } else {
      return { ok: false, error: "Choose one of the listed times, or tell us your preferred date." };
    }
  }

  const token = generateStatusToken();
  const statusTokenHash = hashStatusToken(token);

  const created = await prisma.rescheduleRequest.create({
    data: {
      name,
      email,
      phone,
      address,
      note,
      currentAppointmentDate,
      type,
      arrivalWindow,
      frequency,
      chosenOptionDate,
      chosenOptionBlock,
      chosenOptionWindow,
      chosenOptionFeedMonthId,
      chosenOptionSnapshotTeamsOpen,
      preferredDateText,
      statusTokenHash,
    },
  });

  await logAudit({
    actorId: null,
    action: "RESCHEDULE_REQUEST_CREATED",
    recordType: "RescheduleRequest",
    recordId: created.id,
    changedFields: { type: { to: type }, currentAppointmentDate: { to: currentAppointmentDateRaw } },
  });

  return { ok: true, id: created.id, statusToken: token, type, currentAppointmentDate };
}

// ---------------------------------------------------------------------------
// Badges — informational flags for the staff queue, never reorder the
// oldest-first queue themselves.
export function isAppointmentWithin7Days(currentAppointmentDate: Date, now: Date = new Date()): boolean {
  const todayUtc = new Date(`${businessDateKey(now)}T00:00:00Z`);
  const diffDays = (currentAppointmentDate.getTime() - todayUtc.getTime()) / 86400000;
  return diffDays >= 0 && diffDays <= 7;
}

export async function isPickupOverdue(
  createdAt: Date,
  claimedAt: Date | null,
  now: Date = new Date()
): Promise<boolean> {
  if (claimedAt) return false;
  const config = await getBusinessHours();
  return businessMinutesElapsed(createdAt, now, config, 10) >= 10;
}

// Literal elapsed wall-clock time (never business-hours-adjusted) since
// submission — cleared only by firstStaffResponseAt or a close; the
// automatic receipt never counts as a response.
export function is48hResponseDue(
  createdAt: Date,
  firstStaffResponseAt: Date | null,
  workStatus: RescheduleWorkStatus,
  now: Date = new Date()
): boolean {
  if (firstStaffResponseAt) return false;
  if (workStatus === "CLOSED") return false;
  return now.getTime() - createdAt.getTime() >= 48 * 60 * 60 * 1000;
}

// A date-only or free-text preference (no specific listed opening) never
// blocks another request's specific opening, but is itself flagged for
// staff to look at by hand.
export function isDateOnlyPreference(request: Pick<RescheduleRequest, "chosenOptionBlock" | "preferredDateText" | "type">): boolean {
  if (request.type === "SKIP_ONE") return false;
  return !request.chosenOptionBlock || !!request.preferredDateText;
}

export interface RescheduleBadges {
  appointmentWithin7Days: boolean;
  pickupOverdue: boolean;
  responseDue48h: boolean;
  oddDate: boolean;
  messageFailed: boolean;
  possibleDuplicate: boolean;
  dateOnlyPreference: boolean;
  earlierRequestAhead: boolean;
}

// Whether `candidate`'s chosen/offered opening (if any) is the SAME exact
// listed option as `other`'s — the only thing FIFO blocking and duplicate-
// opening detection ever compare. Keyed on (date, block) only, the exact
// granularity shown to the public (see PublicOpenOption) — a feed window
// is staff-only context, never part of what the customer actually picked,
// so two customers who picked the same shown (date, block) choice are the
// same candidate opening even if they'd map to different feed windows.
function sameOpening(
  a: { chosenOptionDate: Date | null; chosenOptionBlock: string | null },
  b: { chosenOptionDate: Date | null; chosenOptionBlock: string | null }
): boolean {
  if (!a.chosenOptionDate || !a.chosenOptionBlock) return false;
  if (!b.chosenOptionDate || !b.chosenOptionBlock) return false;
  return a.chosenOptionDate.getTime() === b.chosenOptionDate.getTime() && a.chosenOptionBlock === b.chosenOptionBlock;
}

// Still holds its opening — COMPLETED keeps the hold (the opening really
// was taken; staff must recheck TCS rather than assume it's free), PENDING/
// APPROVED still hold it while open, and every other closeOutcome
// (DECLINED/WITHDRAWN/DUPLICATE_OR_INVALID) releases it. Generic
// "workStatus: CLOSED" alone never implies release — only the specific
// closeOutcome does.
function stillHoldsOpening(r: Pick<RescheduleRequest, "workStatus" | "closeOutcome">): boolean {
  if (r.workStatus !== "CLOSED") return true;
  return r.closeOutcome === "COMPLETED";
}

// The oldest other request (by createdAt) that names the exact same
// opening and still holds it — if it's an earlier id than `request`, that
// earlier request blocks staff from offering this opening to `request`.
// Returns null when nothing blocks it.
export function findBlockingEarlierRequest<
  T extends Pick<RescheduleRequest, "id" | "createdAt" | "chosenOptionDate" | "chosenOptionBlock" | "workStatus" | "closeOutcome">
>(request: T, allOpenRequests: T[]): T | null {
  if (!request.chosenOptionDate || !request.chosenOptionBlock) return null;
  const candidates = allOpenRequests
    .filter((other) => other.id !== request.id)
    .filter((other) => sameOpening(request, other))
    .filter((other) => stillHoldsOpening(other))
    .filter((other) => other.createdAt.getTime() < request.createdAt.getTime())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return candidates[0] ?? null;
}

export async function computeBadges(
  request: Pick<
    RescheduleRequest,
    | "id"
    | "createdAt"
    | "claimedAt"
    | "currentAppointmentDate"
    | "firstStaffResponseAt"
    | "workStatus"
    | "closeOutcome"
    | "chosenOptionDate"
    | "chosenOptionBlock"
    | "preferredDateText"
    | "type"
    | "email"
  >,
  openRequestsForFifo: Pick<RescheduleRequest, "id" | "createdAt" | "chosenOptionDate" | "chosenOptionBlock" | "workStatus" | "closeOutcome">[],
  hasFailedMessage: boolean,
  isPossibleDuplicate: boolean,
  now: Date = new Date()
): Promise<RescheduleBadges> {
  return {
    appointmentWithin7Days: isAppointmentWithin7Days(request.currentAppointmentDate, now),
    pickupOverdue: await isPickupOverdue(request.createdAt, request.claimedAt, now),
    responseDue48h: is48hResponseDue(request.createdAt, request.firstStaffResponseAt, request.workStatus, now),
    oddDate: isOddAppointmentDate(request.currentAppointmentDate, now),
    messageFailed: hasFailedMessage,
    possibleDuplicate: isPossibleDuplicate,
    dateOnlyPreference: isDateOnlyPreference(request),
    earlierRequestAhead: findBlockingEarlierRequest(request, openRequestsForFifo) !== null,
  };
}

// ---------------------------------------------------------------------------
// Decision/completion rules — every mutation also requires requireDepartmentAccess
// ("SALES").canEdit at the call site; these only check the request's OWN
// field preconditions.
export function canApprove(request: Pick<RescheduleRequest, "matchedInTcsAt">): boolean {
  return request.matchedInTcsAt !== null;
}

export function canComplete(
  request: Pick<
    RescheduleRequest,
    "decision" | "tcsUpdatedAt" | "confirmedDate" | "confirmedOriginalOutcome" | "confirmedRecurrenceText" | "confirmedFeeNotice" | "feeReview" | "customerInformedAt"
  >
): boolean {
  return (
    request.decision === "APPROVED" &&
    request.tcsUpdatedAt !== null &&
    request.confirmedDate !== null &&
    !!request.confirmedOriginalOutcome &&
    !!request.confirmedRecurrenceText &&
    !!request.confirmedFeeNotice &&
    request.feeReview !== "NOT_DECIDED" &&
    request.customerInformedAt !== null
  );
}

export function canDecline(note: string, customerInformedAt: Date | null): boolean {
  return !!note.trim() && customerInformedAt !== null;
}

export function canWithdrawOrDuplicate(note: string): boolean {
  return !!note.trim();
}

// ---------------------------------------------------------------------------
// Alert recipients — "active Sales-access users," the exact same population
// (not a hand-picked role shortcut) that can view /sales/reschedules at all:
// hasDepartmentAccess(role, grants, "SALES").canView. Office Assistants are
// structurally excluded here, same as from requireDepartmentAccess("SALES")
// itself (see departments.ts — Office Assistant Sales access, where granted
// at all, comes only from AreaAccess, never whole-department access).
export async function getActiveSalesQueueViewerEmails(excludeEmail?: string | null): Promise<string[]> {
  const { hasDepartmentAccess } = await import("@/lib/departments");
  const users = await prisma.user.findMany({
    where: { active: true, isTestAccount: false, role: { in: ["ADMIN", "SERVICE_MANAGER", "SALES_REP"] } },
    select: { email: true, role: true, departmentAccess: { select: { department: true, canEdit: true } } },
  });
  const emails = new Set<string>();
  for (const u of users) {
    const { canView } = hasDepartmentAccess(u.role, u.departmentAccess, "SALES");
    if (!canView) continue;
    if (excludeEmail && u.email.toLowerCase() === excludeEmail.toLowerCase()) continue;
    emails.add(u.email);
  }
  return [...emails];
}

// Staff alert on submit — type, appointment date, 7-day flag, a queue link;
// deliberately never any customer contact data (name/email/phone/address).
export async function sendNewRequestStaffAlert(
  request: Pick<RescheduleRequest, "id" | "type" | "currentAppointmentDate">,
  sendEmailFn: typeof sendEmail = sendEmail
): Promise<void> {
  const notifyEmail = process.env.SALES_NOTIFY_EMAIL || process.env.MS_GRAPH_SENDER_EMAIL;
  if (!notifyEmail) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const queueLink = `${appUrl}/sales/reschedules`;
  const within7Days = isAppointmentWithin7Days(request.currentAppointmentDate);
  const dateLabel = request.currentAppointmentDate.toISOString().slice(0, 10);

  try {
    const bcc = await getActiveSalesQueueViewerEmails(notifyEmail);
    await sendEmailFn({
      to: notifyEmail,
      subject: `New schedule change request: ${TYPE_LABELS[request.type]}`,
      body: [
        `A new reschedule request came in.`,
        `Type: ${TYPE_LABELS[request.type]}`,
        `Current appointment date: ${dateLabel}`,
        within7Days ? `This appointment is within the next 7 days.` : null,
        `Queue: ${queueLink}`,
      ]
        .filter((l): l is string => l !== null)
        .join("\n"),
      ...(bcc.length ? { bcc } : {}),
    });
  } catch {
    // Swallow — an alert failure must never break the public submission.
  }
}

// ---------------------------------------------------------------------------
// Automatic receipt — default-off, one EMAIL per request, claimed (a
// RescheduleMessage row created at PENDING) before the real send attempt.
// Never an automatic text. A PENDING row with no later SENT/FAILED is "send
// uncertain" — never auto-resent; see markReceiptNotSent/resendFailedReceipt.
const AUTO_RECEIPT_SETTING_KEY = "reschedule:autoReceiptEnabled";

export async function isAutoReceiptEnabled(): Promise<boolean> {
  const row = await prisma.salesToolData.findUnique({ where: { key: AUTO_RECEIPT_SETTING_KEY } });
  if (!row) return false;
  try {
    return (JSON.parse(row.value) as { enabled?: boolean }).enabled === true;
  } catch {
    return false;
  }
}

export async function setAutoReceiptEnabled(enabled: boolean): Promise<void> {
  await prisma.salesToolData.upsert({
    where: { key: AUTO_RECEIPT_SETTING_KEY },
    create: { key: AUTO_RECEIPT_SETTING_KEY, value: JSON.stringify({ enabled }) },
    update: { value: JSON.stringify({ enabled }) },
  });
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function buildReceiptBody(request: Pick<RescheduleRequest, "name" | "type" | "currentAppointmentDate">, statusUrl: string): string {
  const action = request.type === "SKIP_ONE" ? "skip" : "move";
  const dateLabel = request.currentAppointmentDate.toISOString().slice(0, 10);
  return [
    `Hi ${firstName(request.name)},`,
    `Mama's Cleaning Crew received your request to ${action} your cleaning on ${dateLabel}. It is not approved yet.`,
    `Your current appointment stays scheduled unless we confirm a change. We are working on it and will get back to you within 48 hours.`,
    `Status: ${statusUrl}`,
    `Fee and rate terms apply as published: ${TERMS_TEXT} (${TERMS_SOURCE_URL})`,
    TERMS_CONTACT_SENTENCE,
  ].join("\n\n");
}

export type SendReceiptResult = { attempted: false } | { attempted: true; ok: boolean };

// Sends the one automatic receipt for a request, if the setting is on and
// no attempt has been made yet (an existing PENDING or SENT row means an
// attempt already happened — this never sends a second one; a FAILED row
// is resent only by resendFailedReceipt below, an explicit staff action).
export async function maybeSendAutomaticReceipt(
  requestId: string,
  statusUrl: string,
  sendEmailFn: typeof sendEmail = sendEmail
): Promise<SendReceiptResult> {
  if (!(await isAutoReceiptEnabled())) return { attempted: false };

  const request = await prisma.rescheduleRequest.findUnique({ where: { id: requestId } });
  if (!request) return { attempted: false };

  const existing = await prisma.rescheduleMessage.findFirst({ where: { requestId, kind: "RECEIPT" } });
  if (existing) return { attempted: false };

  const body = buildReceiptBody(request, statusUrl);
  // The claim itself — created at PENDING before the real send call, same
  // as ScheduledMessage's own claim-then-send ordering.
  const message = await prisma.rescheduleMessage.create({
    data: { requestId, channel: "EMAIL", kind: "RECEIPT", status: "PENDING", body },
  });

  let result: { ok: true } | { ok: false; error: string };
  try {
    result = await sendEmailFn({ to: request.email, subject: "We received your schedule change request", body });
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  await prisma.rescheduleMessage.update({
    where: { id: message.id },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      sentAt: result.ok ? new Date() : null,
      errorMessage: result.ok ? null : result.error,
    },
  });

  return { attempted: true, ok: result.ok };
}

// Staff-only: a receipt row stuck at PENDING (interrupted attempt, "send
// uncertain") is moved to FAILED so it becomes eligible for a manual
// resend — never implies the email definitely wasn't sent, just that it's
// being treated as if it wasn't.
export async function markMessageNotSent(messageId: string, actorId: string): Promise<void> {
  await prisma.rescheduleMessage.updateMany({
    where: { id: messageId, status: "PENDING" },
    data: { status: "FAILED", errorMessage: "Marked as not sent by staff — send was uncertain." },
  });
  await logAudit({ actorId, action: "RESCHEDULE_MESSAGE_MARKED_NOT_SENT", recordType: "RescheduleMessage", recordId: messageId });
}

// Resend only ever applies to a FAILED row — never PENDING (uncertain) and
// never SENT.
export async function resendFailedMessage(
  messageId: string,
  actorId: string,
  sendEmailFn: typeof sendEmail = sendEmail
): Promise<{ ok: boolean }> {
  const message = await prisma.rescheduleMessage.findUnique({ where: { id: messageId } });
  if (!message || message.status !== "FAILED") return { ok: false };

  const request = await prisma.rescheduleRequest.findUnique({ where: { id: message.requestId } });
  if (!request) return { ok: false };

  let result: { ok: true } | { ok: false; error: string };
  try {
    result =
      message.channel === "EMAIL"
        ? await sendEmailFn({
            to: request.email,
            subject: message.kind === "RECEIPT" ? "We received your schedule change request" : "Update on your schedule change request",
            body: message.body,
          })
        : { ok: false, error: "Automatic text resend is not supported — texts are staff-sent only." };
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  await prisma.rescheduleMessage.update({
    where: { id: messageId },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      sentAt: result.ok ? new Date() : null,
      errorMessage: result.ok ? null : result.error,
    },
  });
  await logAudit({ actorId, action: "RESCHEDULE_MESSAGE_RESENT", recordType: "RescheduleMessage", recordId: messageId });
  return result;
}

// ---------------------------------------------------------------------------
// Open-requests count, for the Home/sales Stat card — Sales canView users
// only (enforced by the caller only ever fetching this inside an
// already-gated Sales section, same as every other Sales-only figure on
// those pages).
export interface OpenRequestsSummary {
  count: number;
  oldestCreatedAt: Date | null;
}

export async function getOpenRequestsSummary(now: Date = new Date()): Promise<OpenRequestsSummary> {
  const open = await prisma.rescheduleRequest.findMany({
    where: { workStatus: { not: "CLOSED" } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return { count: open.length, oldestCreatedAt: open[0]?.createdAt ?? null };
}

// A request is a possible duplicate of another still-open-or-completed one
// sharing the same email (case-insensitive) and the same current
// appointment date — a simple, explainable heuristic, never auto-merged or
// auto-closed; staff decide via DUPLICATE_OR_INVALID.
export function findPossibleDuplicates<T extends Pick<RescheduleRequest, "id" | "email" | "currentAppointmentDate">>(
  request: T,
  others: T[]
): T[] {
  return others.filter(
    (o) =>
      o.id !== request.id &&
      o.email.toLowerCase() === request.email.toLowerCase() &&
      o.currentAppointmentDate.getTime() === request.currentAppointmentDate.getTime()
  );
}

// ---------------------------------------------------------------------------
// Staff mutations — every one of these is called from
// src/app/(portal)/sales/reschedules/actions.ts, which checks
// requireDepartmentAccess("SALES").canEdit BEFORE calling any of them. These
// functions themselves only enforce the request's own field preconditions
// (via canApprove/canComplete/canDecline/canWithdrawOrDuplicate above), not
// who's allowed to call them.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function claimRequest(id: string, actorId: string): Promise<{ ok: boolean }> {
  const claim = await prisma.rescheduleRequest.updateMany({
    where: { id, claimedById: null },
    data: { claimedById: actorId, claimedAt: new Date() },
  });
  if (claim.count === 0) return { ok: false };
  await prisma.rescheduleRequest.updateMany({ where: { id, workStatus: "NEW" }, data: { workStatus: "IN_PROGRESS" } });
  await logAudit({ actorId, action: "RESCHEDULE_REQUEST_CLAIMED", recordType: "RescheduleRequest", recordId: id });
  return { ok: true };
}

export async function markMatchedInTcs(id: string, actorId: string): Promise<void> {
  await prisma.rescheduleRequest.update({
    where: { id },
    data: { matchedInTcsAt: new Date(), matchedInTcsById: actorId },
  });
  await logAudit({ actorId, action: "RESCHEDULE_REQUEST_MATCHED_IN_TCS", recordType: "RescheduleRequest", recordId: id });
}

export async function markTcsUpdated(id: string, actorId: string): Promise<void> {
  await prisma.rescheduleRequest.update({
    where: { id },
    data: { tcsUpdatedAt: new Date(), tcsUpdatedById: actorId },
  });
  await logAudit({ actorId, action: "RESCHEDULE_REQUEST_TCS_UPDATED", recordType: "RescheduleRequest", recordId: id });
}

// Only ever set once — guarded on firstStaffResponseAt: null so a later
// call (e.g. a second staff message) never overwrites the real first-
// response time.
export async function recordFirstStaffResponse(id: string, actorId: string): Promise<void> {
  const updated = await prisma.rescheduleRequest.updateMany({
    where: { id, firstStaffResponseAt: null },
    data: { firstStaffResponseAt: new Date(), firstStaffResponseById: actorId },
  });
  if (updated.count > 0) {
    await logAudit({ actorId, action: "RESCHEDULE_REQUEST_FIRST_RESPONSE", recordType: "RescheduleRequest", recordId: id });
  }
}

// Set ONLY by this explicit action — never implied by a message merely
// showing SENT.
export async function markCustomerInformed(id: string, actorId: string): Promise<void> {
  await prisma.rescheduleRequest.update({
    where: { id },
    data: { customerInformedAt: new Date(), customerInformedById: actorId },
  });
  await logAudit({ actorId, action: "RESCHEDULE_CUSTOMER_INFORMED", recordType: "RescheduleRequest", recordId: id });
}

export async function setFeeReview(id: string, feeReview: RescheduleFeeReview, note: string, actorId: string): Promise<void> {
  await prisma.rescheduleRequest.update({
    where: { id },
    data: { feeReview, feeReviewNote: note.trim() || null },
  });
  await logAudit({
    actorId,
    action: "RESCHEDULE_FEE_REVIEW_SET",
    recordType: "RescheduleRequest",
    recordId: id,
    changedFields: { feeReview: { to: feeReview } },
  });
}

export interface ConfirmedResultInput {
  confirmedDate: string; // "YYYY-MM-DD"
  confirmedWindow: string;
  confirmedOriginalOutcome: string;
  confirmedRecurrenceText: string;
  confirmedFeeNotice: string;
}

export async function setConfirmedResult(id: string, input: ConfirmedResultInput, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const confirmedDate = input.confirmedDate.trim() ? parseExactCalendarDate(input.confirmedDate.trim()) : null;
  if (input.confirmedDate.trim() && !confirmedDate) return { ok: false, error: "Enter a real confirmed date." };

  await prisma.rescheduleRequest.update({
    where: { id },
    data: {
      confirmedDate,
      confirmedWindow: input.confirmedWindow.trim() || null,
      confirmedOriginalOutcome: input.confirmedOriginalOutcome.trim() || null,
      confirmedRecurrenceText: input.confirmedRecurrenceText.trim() || null,
      confirmedFeeNotice: input.confirmedFeeNotice.trim() || null,
    },
  });
  await logAudit({ actorId, action: "RESCHEDULE_CONFIRMED_RESULT_SET", recordType: "RescheduleRequest", recordId: id });
  return { ok: true };
}

export async function approveRequest(id: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const request = await prisma.rescheduleRequest.findUnique({ where: { id } });
  if (!request) return { ok: false, error: "Request not found." };
  if (!canApprove(request)) return { ok: false, error: 'Client and appointment matched in TCS is required before approving.' };

  await prisma.rescheduleRequest.update({ where: { id }, data: { decision: "APPROVED" } });
  await logAudit({ actorId, action: "RESCHEDULE_REQUEST_APPROVED", recordType: "RescheduleRequest", recordId: id });
  return { ok: true };
}

export async function completeRequest(id: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const request = await prisma.rescheduleRequest.findUnique({ where: { id } });
  if (!request) return { ok: false, error: "Request not found." };
  if (!canComplete(request)) {
    return {
      ok: false,
      error:
        "Completing requires: approved, TCS updated, a full confirmed result (date, original-appointment outcome, recurrence, fee notice), a decided fee review, and the customer informed.",
    };
  }

  await prisma.rescheduleRequest.update({
    where: { id },
    data: { workStatus: "CLOSED", closeOutcome: "COMPLETED", statusTokenExpiresAt: new Date(Date.now() + THIRTY_DAYS_MS) },
  });
  await logAudit({ actorId, action: "RESCHEDULE_REQUEST_COMPLETED", recordType: "RescheduleRequest", recordId: id });
  return { ok: true };
}

export async function declineRequest(id: string, note: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const request = await prisma.rescheduleRequest.findUnique({ where: { id } });
  if (!request) return { ok: false, error: "Request not found." };
  if (!canDecline(note, request.customerInformedAt)) {
    return { ok: false, error: "A note and confirming the customer was informed are both required to decline." };
  }

  await prisma.rescheduleRequest.update({
    where: { id },
    data: {
      decision: "DECLINED",
      workStatus: "CLOSED",
      closeOutcome: "DECLINED",
      closeNote: note.trim(),
      statusTokenExpiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
    },
  });
  await logAudit({ actorId, action: "RESCHEDULE_REQUEST_DECLINED", recordType: "RescheduleRequest", recordId: id });
  return { ok: true };
}

export async function closeAsWithdrawnOrDuplicate(
  id: string,
  outcome: Extract<RescheduleCloseOutcome, "WITHDRAWN" | "DUPLICATE_OR_INVALID">,
  note: string,
  actorId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!canWithdrawOrDuplicate(note)) return { ok: false, error: "A note is required." };

  await prisma.rescheduleRequest.update({
    where: { id },
    data: {
      workStatus: "CLOSED",
      closeOutcome: outcome,
      closeNote: note.trim(),
      statusTokenExpiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
    },
  });
  await logAudit({ actorId, action: `RESCHEDULE_REQUEST_${outcome}`, recordType: "RescheduleRequest", recordId: id });
  return { ok: true };
}

export async function revokeStatusToken(id: string, actorId: string): Promise<void> {
  await prisma.rescheduleRequest.update({ where: { id }, data: { statusTokenRevokedAt: new Date() } });
  await logAudit({ actorId, action: "RESCHEDULE_STATUS_TOKEN_REVOKED", recordType: "RescheduleRequest", recordId: id });
}

export async function addStaffNote(id: string, body: string, actorId: string): Promise<{ ok: boolean }> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false };
  await prisma.rescheduleNote.create({ data: { requestId: id, authorId: actorId, body: trimmed } });
  await logAudit({ actorId, action: "RESCHEDULE_NOTE_ADDED", recordType: "RescheduleRequest", recordId: id });
  return { ok: true };
}

// FIFO-checked offer — blocks offering a specific (date, block) to `id`
// when an older, still-open request for that SAME exact opening exists.
// Keyed on (date, block) only — the granularity the customer actually saw
// and picked from (see PublicOpenOption) — never a feed window, which is
// staff-only context and was never part of what either customer chose.
// Never rejects outright for a date-only/free-text request (no
// chosenOption on file at all) making the offer — only two requests both
// naming the identical listed option can conflict.
export async function offerOption(
  id: string,
  option: { date: string; block: string; window?: string },
  text: string,
  actorId: string
): Promise<{ ok: boolean; error?: string }> {
  const request = await prisma.rescheduleRequest.findUnique({ where: { id } });
  if (!request) return { ok: false, error: "Request not found." };

  const offerDate = parseExactCalendarDate(option.date.trim());
  if (!offerDate) return { ok: false, error: "Enter a real date for this opening." };
  const block = option.block.trim();
  if (!block) return { ok: false, error: "Block is required." };
  // A feed window, if staff note one, is purely their own informational
  // record of which window they're offering — never part of FIFO matching.
  const window = option.window?.trim() || null;

  const candidates = await prisma.rescheduleRequest.findMany({
    where: { id: { not: id }, chosenOptionDate: offerDate, chosenOptionBlock: block },
    select: { id: true, createdAt: true, chosenOptionDate: true, chosenOptionBlock: true, workStatus: true, closeOutcome: true },
  });
  const virtualSelf = {
    id: request.id,
    createdAt: request.createdAt,
    chosenOptionDate: offerDate,
    chosenOptionBlock: block,
    workStatus: request.workStatus,
    closeOutcome: request.closeOutcome,
  };
  const blocker = findBlockingEarlierRequest(virtualSelf, candidates);
  if (blocker) {
    return {
      ok: false,
      error: `An earlier request (submitted ${blocker.createdAt.toISOString()}) is ahead in line for this exact opening.`,
    };
  }

  await prisma.rescheduleRequest.update({
    where: { id },
    data: {
      offerOptionDate: offerDate,
      offerOptionBlock: block,
      offerOptionWindow: window,
      offerAt: new Date(),
      offerText: text.trim() || null,
      offerOutcome: "OPEN",
    },
  });
  await logAudit({ actorId, action: "RESCHEDULE_REQUEST_OFFERED", recordType: "RescheduleRequest", recordId: id });
  return { ok: true };
}

export async function setOfferOutcome(id: string, outcome: "DECLINED" | "WITHDRAWN", actorId: string): Promise<void> {
  await prisma.rescheduleRequest.update({ where: { id }, data: { offerOutcome: outcome } });
  await logAudit({ actorId, action: "RESCHEDULE_OFFER_OUTCOME_SET", recordType: "RescheduleRequest", recordId: id, changedFields: { offerOutcome: { to: outcome } } });
}

// Staff-composed message (email, or text when a phone is on file) — queued,
// shown before sending, logged either way. The first one also records
// firstStaffResponseAt (if not already set), since reaching out IS the
// first real staff response.
export async function sendStaffMessage(
  id: string,
  channel: "EMAIL" | "SMS",
  body: string,
  actorId: string,
  senders: MessageSenders = DEFAULT_SENDERS
): Promise<{ ok: boolean; error?: string }> {
  const request = await prisma.rescheduleRequest.findUnique({ where: { id } });
  if (!request) return { ok: false, error: "Request not found." };
  if (channel === "SMS" && !request.phone) return { ok: false, error: "No phone number on file for this request." };
  const trimmedBody = body.trim();
  if (!trimmedBody) return { ok: false, error: "Message text is required." };

  const message = await prisma.rescheduleMessage.create({
    data: { requestId: id, channel, kind: "STAFF", status: "PENDING", body: trimmedBody, senderById: actorId },
  });

  let result: { ok: true } | { ok: false; error: string };
  try {
    result =
      channel === "EMAIL"
        ? await senders.sendEmail({ to: request.email, subject: "Update on your schedule change request", body: trimmedBody })
        : await senders.sendSms({ to: request.phone as string, text: trimmedBody });
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  await prisma.rescheduleMessage.update({
    where: { id: message.id },
    data: { status: result.ok ? "SENT" : "FAILED", sentAt: result.ok ? new Date() : null, errorMessage: result.ok ? null : result.error },
  });
  await recordFirstStaffResponse(id, actorId);
  await logAudit({ actorId, action: "RESCHEDULE_MESSAGE_SENT", recordType: "RescheduleMessage", recordId: message.id });
  return result;
}
