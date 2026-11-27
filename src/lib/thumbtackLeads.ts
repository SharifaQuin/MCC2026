// Thumbtack's "Lead" webhook event -> a Lead row in our own pipeline. See
// src/app/api/thumbtack/webhook/route.ts for the HTTP receiver (secret
// check, event-type routing, response codes); this file holds the parsing,
// dedupe, quarantine, and alert logic the route calls into.
//
// ASSUMPTIONS — read before enabling the live connection (also called out
// in this PR's own description):
// - Thumbtack's webhook POSTs a flat JSON object with the fields this file
//   reads (negotiationID, createdAt, customer{...}, request{...}, leadPrice,
//   requestReviewLink) at the TOP LEVEL of the body, not nested under a
//   wrapper key. This matches how the brief describing this payload reads,
//   but was not confirmed against a captured real delivery.
// - No single field name documenting "this is a Lead event" (vs. Message/
//   Review) was available — see getThumbtackEventType below, which tries a
//   few plausible field names first, then falls back to a structural check
//   (only a Lead event has request.requestID + leadPrice together).
// - No test-marker field was found in what was read of Thumbtack's docs —
//   see isExplicitTestMarker below, which currently always returns false.
//   Until a real field name is confirmed, the owner identifies the test
//   delivery herself (see markThumbtackLeadAsTestAction in
//   src/app/(portal)/sales/leads/actions.ts).
//
// Do not enable the live connection (configuring this URL + the Custom
// Header secret in Thumbtack's own dashboard) until these assumptions are
// checked against a real "Test this webhook" delivery.
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizePhoneDigits } from "@/lib/formatPhone";
import { sendEmail } from "@/lib/email";
import { postSlackDMToOwner } from "@/lib/slack";
import { notifyNewLead, ARCHIVED_LEAD_STAGES, buildThumbtackAddress } from "@/lib/leads";
import type { Lead } from "@prisma/client";

const THUMBTACK_SECRET_HEADER = "x-thumbtack-webhook-secret";

// Two equal-length (sha256) digests compared via crypto.timingSafeEqual —
// safe regardless of how the two input strings' lengths differ (a raw
// timingSafeEqual throws on a length mismatch, which a naive "just compare
// the header to the env var" implementation would need to guard separately;
// hashing first sidesteps that entirely while staying constant-time).
function constantTimeEquals(a: string, b: string): boolean {
  const ah = crypto.createHash("sha256").update(a).digest();
  const bh = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
}

// The owner configures Thumbtack's webhook form with Authorization type
// "Custom Header", header name THUMBTACK_SECRET_HEADER (above) and a value
// equal to this env var — never logged, never echoed back.
export function verifyThumbtackWebhookSecret(headerValue: string | null): boolean {
  const expected = process.env.THUMBTACK_WEBHOOK_SECRET;
  if (!expected || !headerValue) return false;
  return constantTimeEquals(headerValue, expected);
}

export { THUMBTACK_SECRET_HEADER };

// ON by default (unset = quarantine ON) — only an explicit "false"/"0"/"off"
// turns it off, so a missing or misconfigured env var fails toward holding
// every delivery for review rather than toward live production writes.
export function isThumbtackQuarantineEnabled(): boolean {
  const raw = (process.env.THUMBTACK_QUARANTINE_ENABLED ?? "").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

interface ThumbtackCustomer {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

interface ThumbtackLocation {
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

interface ThumbtackDetail {
  question?: string;
  answer?: string;
}

interface ThumbtackRequest {
  requestID?: string;
  description?: string;
  category?: { name?: string };
  location?: ThumbtackLocation;
  details?: ThumbtackDetail[];
  proposedTimes?: unknown;
}

interface ThumbtackLeadBody {
  negotiationID?: string;
  createdAt?: string;
  customer?: ThumbtackCustomer;
  request?: ThumbtackRequest;
  leadPrice?: number;
  requestReviewLink?: string;
  // Not a confirmed real field name — see the file header comment. Checked
  // defensively in case Thumbtack's own docs do name one of these.
  isTest?: boolean;
  test?: boolean;
}

export type ThumbtackEventType = "LEAD" | "MESSAGE" | "REVIEW" | "UNKNOWN";

// Tries a few plausible "what kind of event is this" field names first;
// falls back to a structural check (a Lead event is the only one with both
// request.requestID and a leadPrice) when none of those are present. See
// the file header comment — this field name was not confirmed.
export function getThumbtackEventType(body: unknown): ThumbtackEventType {
  if (!body || typeof body !== "object") return "UNKNOWN";
  const b = body as Record<string, unknown>;
  const raw = String(b.eventType ?? b.type ?? b.event ?? "").toLowerCase();
  if (raw.includes("lead")) return "LEAD";
  if (raw.includes("message")) return "MESSAGE";
  if (raw.includes("review")) return "REVIEW";

  const request = b.request as ThumbtackRequest | undefined;
  if (b.negotiationID && request?.requestID && typeof b.leadPrice === "number") return "LEAD";
  return "UNKNOWN";
}

// Always false today — no confirmed test-marker field exists in what was
// read of Thumbtack's docs (see file header). Deliberately narrow: checks
// only a field that would mean "Thumbtack itself marked this," never
// anything derived from customer name, description, or other content.
function isExplicitTestMarker(body: ThumbtackLeadBody): boolean {
  return body.isTest === true || body.test === true;
}

// Digits only, tolerant of a missing phone — the one sample seen was
// digits-only with no formatting, but nothing here assumes that holds for
// every delivery.
function normalizeThumbtackPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

export interface ParsedThumbtackLead {
  negotiationID: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string | null;
  serviceInterest: string | null;
  message: string | null;
  customFields: { label: string; value: string }[] | null;
  leadPrice: number | null;
  requestReviewLink: string | null;
  isTest: boolean;
}

// Returns null when the body doesn't even have a negotiationID — nothing
// else here can safely proceed without that identity.
export function parseThumbtackLeadBody(body: unknown): ParsedThumbtackLead | null {
  if (!body || typeof body !== "object") return null;
  const b = body as ThumbtackLeadBody;
  const negotiationID = typeof b.negotiationID === "string" ? b.negotiationID.trim() : "";
  if (!negotiationID) return null;

  const customer = b.customer ?? {};
  const request = b.request ?? {};
  const details = Array.isArray(request.details) ? request.details : [];
  const customFields = details
    .filter((d): d is { question: string; answer: string } => !!d?.question && !!d?.answer)
    .map((d) => ({ label: d.question, value: d.answer }));

  return {
    negotiationID,
    firstName: customer.firstName?.trim() || "Thumbtack",
    lastName: customer.lastName?.trim() || "Lead",
    phone: normalizeThumbtackPhone(customer.phone),
    address: buildThumbtackAddress(request.location),
    serviceInterest: request.category?.name?.trim() || null,
    message: request.description?.trim() || null,
    customFields: customFields.length > 0 ? customFields : null,
    leadPrice: typeof b.leadPrice === "number" ? b.leadPrice : null,
    requestReviewLink: b.requestReviewLink?.trim() || null,
    isTest: isExplicitTestMarker(b),
  };
}

export type ThumbtackIngestOutcome = "created" | "duplicate" | "failed";

export interface ThumbtackIngestResult {
  outcome: ThumbtackIngestOutcome;
  leadId: string | null;
}

// The whole item-2/3/4/5/8 pipeline: negotiationID identity dedupe (never a
// second lead for the same delivery, replayed or not), a phone-match flag
// against any other currently-open lead (never a block — see
// findPossibleDuplicateOpenLead below), quarantine-or-not, and the matching
// alert. Never throws on a business-rule outcome (duplicate) — only an
// unexpected DB error propagates, for the route handler's own try/catch to
// turn into a non-2xx response.
export async function ingestThumbtackLead(
  parsed: ParsedThumbtackLead,
  sendEmailFn: typeof sendEmail = sendEmail
): Promise<ThumbtackIngestResult> {
  const existing = await prisma.lead.findUnique({ where: { externalId: parsed.negotiationID }, select: { id: true } });
  if (existing) return { outcome: "duplicate", leadId: existing.id };

  const duplicateOfId = await findPossibleDuplicateOpenLead(parsed.phone);
  const quarantined = isThumbtackQuarantineEnabled();

  const lead = await prisma.lead.create({
    data: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      phone: parsed.phone,
      address: parsed.address,
      source: "THUMBTACK",
      serviceInterest: parsed.serviceInterest,
      message: parsed.message,
      customFields: parsed.customFields ?? undefined,
      externalId: parsed.negotiationID,
      isTest: parsed.isTest,
      quarantined,
      possibleDuplicate: duplicateOfId !== null,
      thumbtackLeadPrice: parsed.leadPrice,
      thumbtackRequestUrl: parsed.requestReviewLink,
    },
  });

  if (duplicateOfId) {
    await prisma.leadNote.create({
      data: {
        leadId: lead.id,
        authorId: null,
        body: `Possible duplicate: this lead's phone number matches an already-open lead (${duplicateOfId}). Not merged or blocked — flagged for a human look.`,
      },
    });
  }

  // No auto-reply, no draft quote for a Thumbtack lead (item 5) — neither
  // is ever called here, quarantined or not. See maybeSendAfterHoursAutoReply/
  // createDraftQuoteForLead's own call sites: this function is the only
  // place a Thumbtack Lead gets created, and it never calls either.
  if (quarantined) {
    await sendThumbtackQuarantineAlert(lead, sendEmailFn);
  } else {
    await notifyNewLead(lead, sendEmailFn);
  }

  return { outcome: "created", leadId: lead.id };
}

// "Open" mirrors every other open-pipeline check in this file (ARCHIVED_LEAD_STAGES
// + WON) — a phone match against a decided-outcome lead isn't a live
// duplicate inquiry. Flags, never merges/skips/blocks: the caller always
// still creates the new lead regardless of what this returns.
async function findPossibleDuplicateOpenLead(phone: string): Promise<string | null> {
  const phoneDigits = normalizePhoneDigits(phone);
  if (phoneDigits.size === 0) return null;

  const openLeads = await prisma.lead.findMany({
    where: { stage: { notIn: ["WON", ...ARCHIVED_LEAD_STAGES] } },
    select: { id: true, phone: true },
  });
  const match = openLeads.find((l) => [...normalizePhoneDigits(l.phone)].some((d) => phoneDigits.has(d)));
  return match?.id ?? null;
}

// Quiet — owner only, no BCC team (contrast with notifyNewLead's normal
// alert, which goes to the full Sales rep/Office Assistant BCC list). Never
// throws: same best-effort shape as every other new-lead alert in this app.
export async function sendThumbtackQuarantineAlert(
  lead: Pick<Lead, "id">,
  sendEmailFn: typeof sendEmail = sendEmail
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const profileUrl = `${appUrl}/sales/leads/${lead.id}`;

  const notifyEmail = process.env.SALES_NOTIFY_EMAIL || process.env.MS_GRAPH_SENDER_EMAIL;
  if (notifyEmail) {
    try {
      await sendEmailFn({
        to: notifyEmail,
        subject: "Thumbtack delivery held for review",
        body: [
          "A Thumbtack webhook delivery is being held in quarantine for your review — it hasn't gone to the sales team yet.",
          "",
          `Review it here: ${profileUrl}`,
        ].join("\n"),
      });
    } catch {
      // Best-effort — never blocks the webhook response.
    }
  }

  await postSlackDMToOwner(
    [":warning: A Thumbtack delivery is held for review.", `<${profileUrl}|Review it>`].join("\n")
  );
}

// The lib half of the two Admin-only lead-page actions (see
// src/app/(portal)/sales/leads/actions.ts for the thin auth-check wrappers
// that call these) — kept here, not inline in the "use server" actions
// file, so tests can call them directly with an injected sendEmailFn, the
// same pattern every other alert-sending function in this app uses.
export async function markThumbtackLeadAsTest(leadId: string): Promise<void> {
  await prisma.lead.update({ where: { id: leadId }, data: { isTest: true } });
}

export async function releaseThumbtackLeadToPipeline(
  leadId: string,
  sendEmailFn: typeof sendEmail = sendEmail
): Promise<Lead> {
  const lead = await prisma.lead.update({ where: { id: leadId }, data: { quarantined: false } });
  await notifyNewLead(lead, sendEmailFn);
  return lead;
}

// Logged on every delivery, success or not — negotiationID only, never a
// customer name/phone/address (item 9's own logging rule).
export function logThumbtackDelivery(
  outcome: "created" | "duplicate" | "ignored" | "rejected" | "failed",
  negotiationID: string | null
): void {
  console.log(JSON.stringify({ source: "thumbtack-webhook", outcome, negotiationID }));
}
