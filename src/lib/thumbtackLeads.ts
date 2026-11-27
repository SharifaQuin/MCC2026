// Thumbtack's "Lead" webhook event -> a Lead row in our own pipeline. See
// src/app/api/thumbtack/webhook/route.ts for the HTTP receiver (secret
// check, event-type routing, response codes); this file holds the parsing,
// dedupe, quarantine, and alert logic the route calls into.
//
// The real Lead/Message payload shapes below (field names and types) were
// confirmed directly — negotiationID/request.requestID/leadPrice etc. are
// real top-level fields, not nested under a wrapper key, and leadPrice can
// arrive as either a number or a string (sometimes with a "$" and commas).
//
// Still unconfirmed:
// - Review events' shape was never given — getThumbtackEventType only
//   recognizes LEAD (request.requestID present) and MESSAGE (messageID
//   present); anything else, Review included, is UNKNOWN and gets a
//   non-2xx (see the route) so a shape this file doesn't yet handle is
//   never silently swallowed.
// - No test-marker field was found in what was read of Thumbtack's docs —
//   see isExplicitTestMarker below, which currently always returns false.
//   Until a real field name is confirmed, the owner identifies the test
//   delivery herself (see markThumbtackLeadAsTestAction in
//   src/app/(portal)/sales/leads/actions.ts).
//
// Do not enable the live connection (configuring this URL + the Custom
// Header secret in Thumbtack's own dashboard) until Review's shape (if it
// matters) and the test-marker field are confirmed against a real
// delivery.
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { normalizePhoneDigits } from "@/lib/formatPhone";
import { sendEmail } from "@/lib/email";
import { postSlackDMToOwner } from "@/lib/slack";
import { notifyNewLead, ARCHIVED_LEAD_STAGES, buildThumbtackAddress } from "@/lib/leads";
import type { Lead } from "@prisma/client";
import type { SessionPayload } from "@/lib/session";

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
  customerID?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  // Message events only — the customer is shown as "Unknown" there, never
  // a real name; this field is read nowhere, it's just part of the real
  // shape.
  displayName?: string;
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

interface ThumbtackProposedTime {
  start?: string;
  end?: string;
}

interface ThumbtackRequest {
  requestID?: string;
  customerID?: string;
  description?: string;
  category?: { categoryID?: string; name?: string };
  proposedTimes?: ThumbtackProposedTime[];
  location?: ThumbtackLocation;
  details?: ThumbtackDetail[];
  attachments?: unknown[];
}

interface ThumbtackLeadBody {
  negotiationID?: string;
  createdAt?: string;
  customer?: ThumbtackCustomer;
  business?: unknown;
  request?: ThumbtackRequest;
  status?: string;
  // Real deliveries send this as a string (sometimes with a "$" and
  // commas), not a number — see parseThumbtackLeadPrice below. A plain
  // number is still accepted too, in case that ever changes.
  leadPrice?: number | string;
  leadPriceBreakdown?: unknown;
  chargeState?: string;
  requestReviewLink?: string;
  // Not a confirmed real field name — see the file header comment. Checked
  // defensively in case Thumbtack's own docs do name one of these.
  isTest?: boolean;
  test?: boolean;
}

// Message events carry no request object at all, and the customer is shown
// as "Unknown" — read nowhere below, this type exists only to document the
// real shape getThumbtackEventType's MESSAGE branch matches against.
interface ThumbtackMessageBody {
  messageID?: string;
  negotiationID?: string;
  customer?: { customerID?: string; displayName?: string };
  business?: unknown;
  from?: string;
  text?: string;
  sentAt?: string;
}

export type ThumbtackEventType = "LEAD" | "MESSAGE" | "UNKNOWN";

// A Lead event is identified by request.requestID being a non-empty
// string; a Message event by messageID being a string — Thumbtack sends no
// field of its own naming the event type. Anything else (Review events
// included — their shape was never given) is UNKNOWN, which the route
// turns into a non-2xx rather than a silent 2xx ignore, so a shape this
// file doesn't yet handle is never mistaken for "nothing to do."
export function getThumbtackEventType(body: unknown): ThumbtackEventType {
  if (!body || typeof body !== "object") return "UNKNOWN";
  const b = body as ThumbtackLeadBody & ThumbtackMessageBody;
  if (typeof b.request?.requestID === "string" && b.request.requestID.trim()) return "LEAD";
  if (typeof b.messageID === "string" && b.messageID.trim()) return "MESSAGE";
  return "UNKNOWN";
}

// Always false today — no confirmed test-marker field exists in what was
// read of Thumbtack's docs (see file header). Deliberately narrow: checks
// only a field that would mean "Thumbtack itself marked this," never
// anything derived from customer name, description, or other content.
function isExplicitTestMarker(body: ThumbtackLeadBody): boolean {
  return body.isTest === true || body.test === true;
}

// Digits only, tolerant of a missing phone — nothing here assumes a
// particular incoming format.
function normalizeThumbtackPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

// Accepts a real number, or a string that may carry a "$" and/or commas
// ("$1,234.50") — real deliveries send leadPrice as a string. Returns null
// for anything that isn't a parseable amount, never guesses.
function parseThumbtackLeadPrice(raw: number | string | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[$,]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
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
    leadPrice: parseThumbtackLeadPrice(b.leadPrice),
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

  let lead: Lead;
  try {
    lead = await prisma.lead.create({
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
  } catch (err) {
    // Two concurrent deliveries for the same negotiationID both pass the
    // findUnique check above before either writes — the unique constraint
    // on externalId is what actually decides it, and the loser lands here
    // instead of a 500. Whichever row won the race is the real lead; this
    // never creates a second one.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.lead.findUnique({
        where: { externalId: parsed.negotiationID },
        select: { id: true },
      });
      if (winner) return { outcome: "duplicate", leadId: winner.id };
    }
    throw err;
  }

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
//
// Restricted to source: THUMBTACK — this is Thumbtack-quarantine plumbing,
// never a generic "flag any lead as test" control.
export async function markThumbtackLeadAsTest(leadId: string): Promise<{ marked: boolean }> {
  const updated = await prisma.lead.updateMany({
    where: { id: leadId, source: "THUMBTACK" },
    data: { isTest: true },
  });
  return { marked: updated.count === 1 };
}

// Conditional update (id + source: THUMBTACK + quarantined: true) so a
// double click or a second tab can only ever win the race once — the
// alert only fires when this exact call is the one that actually flipped
// quarantined, never on a call that matched zero rows because another
// request (or an earlier click) already released it.
export async function releaseThumbtackLeadToPipeline(
  leadId: string,
  sendEmailFn: typeof sendEmail = sendEmail
): Promise<{ released: boolean }> {
  const updated = await prisma.lead.updateMany({
    where: { id: leadId, source: "THUMBTACK", quarantined: true },
    data: { quarantined: false },
  });
  if (updated.count !== 1) return { released: false };

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  await notifyNewLead(lead, sendEmailFn);
  return { released: true };
}

// Shared server-side guard — used everywhere a lead id is accepted (every
// action in src/app/(portal)/sales/leads/actions.ts, the scheduled-message
// create path, and the scheduled-message sender). A non-Admin role gets
// the exact same "doesn't exist" treatment the lead page itself already
// gives a quarantined/test lead — hiding it from the UI was never real
// access control on its own, every read and mutation needs this too.
export async function getAccessibleLead(leadId: string, session: SessionPayload): Promise<Lead | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;
  if ((lead.quarantined || lead.isTest) && session.role !== "ADMIN") return null;
  return lead;
}

// Separate from getAccessibleLead above: this applies to EVERYONE,
// including Admin — Release to pipeline / Mark as test and plain viewing
// stay available to Admin, but no customer contact (email, text, a
// scheduled send, the after-hours auto-reply) is ever allowed for a lead
// still quarantined or confirmed as Thumbtack's own test, regardless of
// who's asking.
export function isLeadContactBlocked(lead: Pick<Lead, "quarantined" | "isTest">): boolean {
  return lead.quarantined || lead.isTest;
}

// Logged on every delivery, success or not — negotiationID only, never a
// customer name/phone/address (item 9's own logging rule).
export function logThumbtackDelivery(
  outcome: "created" | "duplicate" | "ignored" | "rejected" | "failed",
  negotiationID: string | null
): void {
  console.log(JSON.stringify({ source: "thumbtack-webhook", outcome, negotiationID }));
}
