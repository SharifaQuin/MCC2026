import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  parseThumbtackLeadBody,
  getThumbtackEventType,
  ingestThumbtackLead,
  markThumbtackLeadAsTest,
  releaseThumbtackLeadToPipeline,
  shouldAlertAfterRelease,
  getAccessibleLead,
  isLeadContactBlocked,
  THUMBTACK_SECRET_HEADER,
  logThumbtackAuthRejectedDiagnostics,
  logThumbtackBodyDiagnostics,
  maybeAlertOwnerOfThumbtackSaveFailure,
  resetThumbtackAlertState,
  type ThumbtackSaveFailureReason,
} from "../src/lib/thumbtackLeads";
import { loadLeadKpis, getLeadFunnelBySource, getLostLeads, buildLeadExportCsv } from "../src/lib/leads";
import { maybeSendAfterHoursAutoReply } from "../src/lib/leadAutoReply";
import { processScheduledMessage } from "../src/lib/scheduledMessageScheduler";
import { hashPassword } from "../src/lib/password";
import type { sendEmail } from "../src/lib/email";
import type { SessionPayload } from "../src/lib/session";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const PASSWORD = "Test-Password-123!";
const WEBHOOK_SECRET = process.env.THUMBTACK_WEBHOOK_SECRET ?? "";
const WEBHOOK_URL = "/api/thumbtack/webhook";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function logout(page: Page) {
  await page.evaluate(() => fetch("/logout", { method: "POST" }));
}

// Same capture/replay technique established elsewhere in this suite
// (e.g. reschedule-requests.spec.ts): captures a real, well-formed Server
// Action request's exact wire bytes, then replays those same bytes under a
// different session's cookies — proves authorization is what refuses it,
// not a malformed payload.
interface CapturedAction {
  actionId: string;
  body: Buffer;
  contentType: string;
}

async function captureAction(page: Page, trigger: () => Promise<void>): Promise<CapturedAction> {
  let captured: CapturedAction | null = null;
  const listener = (req: import("@playwright/test").Request) => {
    const header = req.headers()["next-action"];
    if (header && !captured) {
      captured = {
        actionId: header,
        body: req.postDataBuffer() ?? Buffer.alloc(0),
        contentType: req.headers()["content-type"] ?? "text/plain;charset=UTF-8",
      };
    }
  };
  page.on("request", listener);
  await trigger();
  await page.waitForTimeout(800);
  page.off("request", listener);
  if (!captured) throw new Error("Failed to capture a Server Action request — trigger() didn't fire one.");
  return captured;
}

async function replayAction(page: Page, path: string, captured: CapturedAction) {
  return page.request.post(path, {
    headers: { "next-action": captured.actionId, "content-type": captured.contentType },
    data: captured.body,
  });
}

// Captures console.log lines written by `fn` (a synchronous diagnostic
// logger) without touching the real console — used to assert on the
// failure-diagnostics log lines directly, since this is a plain function
// call, not an HTTP round trip (whose server-process stdout this Playwright
// process can't read).
function captureConsoleLog(fn: () => void): string[] {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines;
}

// A sample Thumbtack "Lead" event — field names and types confirmed
// against the real payload shape (see src/lib/thumbtackLeads.ts's file
// header): a flat body, leadPrice sent as a STRING (sometimes with a "$"
// and commas), request.requestID is the event-type signal. Only
// invented/fake values — no real customer data.
function sampleLeadBody(overrides: Record<string, unknown> = {}) {
  return {
    negotiationID: `negotiation-${RUN_ID}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    customer: {
      customerID: `customer-${RUN_ID}`,
      firstName: "Pat",
      lastName: "Customer",
      phone: `949555${Math.floor(1000 + Math.random() * 8999)}`,
    },
    business: { businessID: "business-fake-id" },
    request: {
      requestID: `request-${RUN_ID}-${Math.random().toString(36).slice(2)}`,
      customerID: `customer-${RUN_ID}`,
      description: "Need a deep clean before move-in",
      category: { categoryID: "cat-fake-id", name: "House Cleaning" },
      proposedTimes: [{ start: "2026-12-01T09:00:00Z", end: "2026-12-01T11:00:00Z" }],
      location: { address1: "123 Main St", city: "Irvine", state: "CA", zipCode: "92618" },
      details: [{ question: "How many bedrooms?", answer: "3" }],
      attachments: [],
    },
    status: "ACTIVE",
    leadPrice: "$24.50",
    leadPriceBreakdown: {},
    chargeState: "CHARGED",
    requestReviewLink: "https://www.thumbtack.com/some-request",
    ...overrides,
  };
}

// A sample Thumbtack "Message" event — real shape has no request object at
// all, and the customer is shown only as a displayName (never a real
// first/last name).
function sampleMessageBody(overrides: Record<string, unknown> = {}) {
  return {
    messageID: `message-${RUN_ID}-${Math.random().toString(36).slice(2)}`,
    negotiationID: `negotiation-${RUN_ID}-${Math.random().toString(36).slice(2)}`,
    customer: { customerID: `customer-${RUN_ID}`, displayName: "Unknown" },
    business: { businessID: "business-fake-id" },
    from: "CUSTOMER",
    text: "Hi, are you available Tuesday?",
    sentAt: new Date().toISOString(),
    ...overrides,
  };
}

// The exact shape Thumbtack's own delivery screen showed for the real
// paid lead this diagnostics work was prompted by (Nov 27, 2026) — adds
// estimate and refundRequestLink on top of sampleLeadBody's fields, plus
// an invented accessCode to stand in for whatever unlisted key a real
// delivery might carry. Still only invented values — no real customer
// data, no real Thumbtack URLs or codes.
function sampleRealDeliveryShapeLeadBody(overrides: Record<string, unknown> = {}) {
  return sampleLeadBody({
    estimate: { low: 100, high: 200 },
    refundRequestLink: "https://www.thumbtack.com/some-refund-request",
    accessCode: "fake-access-code-not-real",
    ...overrides,
  });
}

async function cleanupLead(id: string | null) {
  if (!id) return;
  await prisma.leadNote.deleteMany({ where: { leadId: id } });
  await prisma.lead.delete({ where: { id } }).catch(() => {});
}

test.describe("Thumbtack webhook: parsing and event-type detection (direct lib calls)", () => {
  test("parses the required Lead-event fields; a missing phone is tolerated, never assumed", () => {
    const parsed = parseThumbtackLeadBody(sampleLeadBody({ customer: { firstName: "Pat", lastName: "Customer" } }));
    expect(parsed).not.toBeNull();
    expect(parsed!.firstName).toBe("Pat");
    expect(parsed!.lastName).toBe("Customer");
    expect(parsed!.phone).toBe("");
    expect(parsed!.serviceInterest).toBe("House Cleaning");
    expect(parsed!.message).toBe("Need a deep clean before move-in");
    expect(parsed!.customFields).toEqual([{ label: "How many bedrooms?", value: "3" }]);
    expect(parsed!.address).toContain("Irvine");
    expect(parsed!.leadPrice).toBe(24.5); // "$24.50" string parsed to a number
    expect(parsed!.requestReviewLink).toBe("https://www.thumbtack.com/some-request");
  });

  test("leadPrice is accepted as a number, or a string with a '$' and/or commas — never guessed when unparseable", () => {
    expect(parseThumbtackLeadBody(sampleLeadBody({ leadPrice: "$1,234.50" }))!.leadPrice).toBe(1234.5);
    expect(parseThumbtackLeadBody(sampleLeadBody({ leadPrice: "24.50" }))!.leadPrice).toBe(24.5);
    expect(parseThumbtackLeadBody(sampleLeadBody({ leadPrice: 24.5 }))!.leadPrice).toBe(24.5);
    expect(parseThumbtackLeadBody(sampleLeadBody({ leadPrice: "not a price" }))!.leadPrice).toBeNull();
    expect(parseThumbtackLeadBody(sampleLeadBody({ leadPrice: undefined }))!.leadPrice).toBeNull();
  });

  test("a digits-only phone in any format is normalized; parsing fails without a negotiationID", () => {
    const parsed = parseThumbtackLeadBody(
      sampleLeadBody({ customer: { firstName: "Pat", lastName: "Customer", phone: "(949) 555-1212" } })
    );
    expect(parsed!.phone).toBe("9495551212");

    expect(parseThumbtackLeadBody(sampleLeadBody({ negotiationID: "" }))).toBeNull();
    expect(parseThumbtackLeadBody(sampleLeadBody({ negotiationID: undefined }))).toBeNull();
  });

  test("a Lead event is recognized by request.requestID; a Message event by messageID; anything else is UNKNOWN", () => {
    expect(getThumbtackEventType(sampleLeadBody())).toBe("LEAD");
    expect(getThumbtackEventType(sampleMessageBody())).toBe("MESSAGE");
    expect(getThumbtackEventType(sampleMessageBody({ messageID: "" }))).toBe("UNKNOWN");
    expect(getThumbtackEventType({})).toBe("UNKNOWN");
    expect(getThumbtackEventType({ someOtherShape: true })).toBe("UNKNOWN"); // e.g. a Review event
    expect(getThumbtackEventType(null)).toBe("UNKNOWN");
  });
});

test.describe("Thumbtack webhook: ingest, dedupe, and no-contact (direct lib calls)", () => {
  const createdIds: string[] = [];
  let originalQuarantineFlag: string | undefined;

  test.beforeAll(() => {
    originalQuarantineFlag = process.env.THUMBTACK_QUARANTINE_ENABLED;
  });

  test.afterEach(() => {
    if (originalQuarantineFlag === undefined) delete process.env.THUMBTACK_QUARANTINE_ENABLED;
    else process.env.THUMBTACK_QUARANTINE_ENABLED = originalQuarantineFlag;
  });

  test.afterAll(async () => {
    for (const id of createdIds) await cleanupLead(id);
  });

  test("a Lead event creates exactly one lead, with no email on file", async () => {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "false";
    const parsed = parseThumbtackLeadBody(sampleLeadBody())!;
    const result = await ingestThumbtackLead(parsed);
    expect(result.outcome).toBe("created");
    createdIds.push(result.leadId!);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: result.leadId! } });
    expect(lead.email).toBeNull();
    expect(lead.source).toBe("THUMBTACK");
    expect(lead.externalId).toBe(parsed.negotiationID);
    expect(lead.quarantined).toBe(false);
    // Never contacted automatically — see the next test for the stronger,
    // function-level version of this same guarantee.
    expect(lead.autoReplySentAt).toBeNull();
    expect(lead.quoteKey).toBeNull();
  });

  test("the same negotiationID delivered again never creates a second lead", async () => {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "false";
    const parsed = parseThumbtackLeadBody(sampleLeadBody())!;
    const first = await ingestThumbtackLead(parsed);
    createdIds.push(first.leadId!);
    expect(first.outcome).toBe("created");

    const replay = await ingestThumbtackLead(parsed);
    expect(replay.outcome).toBe("duplicate");
    expect(replay.leadId).toBe(first.leadId);

    const count = await prisma.lead.count({ where: { externalId: parsed.negotiationID } });
    expect(count).toBe(1);
  });

  test("two different negotiationIDs with the same phone both stay separate leads — the second is flagged for review, never merged, skipped, or dropped", async () => {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "false";
    const sharedPhone = `949555${Math.floor(1000 + Math.random() * 8999)}`;

    const first = await ingestThumbtackLead(
      parseThumbtackLeadBody(sampleLeadBody({ customer: { firstName: "A", lastName: "One", phone: sharedPhone } }))!
    );
    createdIds.push(first.leadId!);
    const second = await ingestThumbtackLead(
      parseThumbtackLeadBody(sampleLeadBody({ customer: { firstName: "B", lastName: "Two", phone: sharedPhone } }))!
    );
    createdIds.push(second.leadId!);

    expect(first.outcome).toBe("created");
    expect(second.outcome).toBe("created");
    expect(first.leadId).not.toBe(second.leadId);

    const [leadA, leadB] = await Promise.all([
      prisma.lead.findUniqueOrThrow({ where: { id: first.leadId! } }),
      prisma.lead.findUniqueOrThrow({ where: { id: second.leadId! } }),
    ]);
    expect(leadA.possibleDuplicate).toBe(false);
    expect(leadB.possibleDuplicate).toBe(true);

    const note = await prisma.leadNote.findFirstOrThrow({ where: { leadId: leadB.id } });
    expect(note.body).toContain(leadA.id);
  });

  test("a Thumbtack lead never triggers the after-hours auto-reply or a draft quote, quarantined or not", async () => {
    for (const quarantineFlag of ["false", "true"]) {
      process.env.THUMBTACK_QUARANTINE_ENABLED = quarantineFlag;
      const result = await ingestThumbtackLead(parseThumbtackLeadBody(sampleLeadBody())!);
      createdIds.push(result.leadId!);
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: result.leadId! } });
      // autoReplySentAt/quoteKey are only ever set by
      // maybeSendAfterHoursAutoReply/createDraftQuoteForLead respectively —
      // their being unset here is direct proof neither was invoked.
      expect(lead.autoReplySentAt, `quarantine=${quarantineFlag}`).toBeNull();
      expect(lead.quoteKey, `quarantine=${quarantineFlag}`).toBeNull();
    }
  });
});

test.describe("Thumbtack webhook: quarantine, release, and mark-as-test (direct lib calls)", () => {
  const createdIds: string[] = [];
  let originalQuarantineFlag: string | undefined;
  let originalNotifyEmail: string | undefined;

  test.beforeAll(() => {
    originalQuarantineFlag = process.env.THUMBTACK_QUARANTINE_ENABLED;
    originalNotifyEmail = process.env.SALES_NOTIFY_EMAIL;
  });

  test.afterEach(() => {
    if (originalQuarantineFlag === undefined) delete process.env.THUMBTACK_QUARANTINE_ENABLED;
    else process.env.THUMBTACK_QUARANTINE_ENABLED = originalQuarantineFlag;
    if (originalNotifyEmail === undefined) delete process.env.SALES_NOTIFY_EMAIL;
    else process.env.SALES_NOTIFY_EMAIL = originalNotifyEmail;
  });

  test.afterAll(async () => {
    for (const id of createdIds) await cleanupLead(id);
  });

  test("quarantine ON (the default/unset state) saves the lead — never drops it — and sends only a quiet owner-only alert, never the normal rep alert", async () => {
    delete process.env.THUMBTACK_QUARANTINE_ENABLED; // unset = ON, the secure default
    process.env.SALES_NOTIFY_EMAIL = `owner-${RUN_ID}@example.com`;

    const calls: Parameters<typeof sendEmail>[0][] = [];
    const spy: typeof sendEmail = async (args) => {
      calls.push(args);
      return { ok: true };
    };

    const result = await ingestThumbtackLead(parseThumbtackLeadBody(sampleLeadBody())!, spy);
    createdIds.push(result.leadId!);
    expect(result.outcome).toBe("created");

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: result.leadId! } });
    expect(lead.quarantined).toBe(true);
    // Every normal field is still kept — never dropped just because it's
    // quarantined.
    expect(lead.source).toBe("THUMBTACK");
    expect(lead.firstName).toBeTruthy();

    expect(calls.length).toBe(1);
    expect(calls[0].to).toBe(process.env.SALES_NOTIFY_EMAIL);
    expect(calls[0].subject).toContain("held for review");
    expect(calls[0].bcc ?? []).toHaveLength(0); // quiet — no rep/OA bcc list
  });

  test("quarantined and isTest leads are excluded from KPIs, the funnel, the lost list, and CSV export — release sends the normal alert to the normal recipients; marking as test excludes it again forever", async () => {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "true";
    process.env.SALES_NOTIFY_EMAIL = `owner-${RUN_ID}@example.com`;

    const result = await ingestThumbtackLead(parseThumbtackLeadBody(sampleLeadBody())!);
    const leadId = result.leadId!;
    createdIds.push(leadId);

    const [kpisBefore, funnelBefore, csvBefore] = await Promise.all([
      loadLeadKpis(),
      getLeadFunnelBySource(),
      buildLeadExportCsv(),
    ]);
    expect(kpisBefore.needsAttention.some((a) => a.id === leadId)).toBe(false);
    const thumbtackBefore = funnelBefore.find((f) => f.source === "THUMBTACK");
    expect(csvBefore).not.toContain(leadId);

    // Release — the normal new-lead alert goes out, same recipients
    // getNewLeadAlertBccEmails would compute for any other source.
    const calls: Parameters<typeof sendEmail>[0][] = [];
    const spy: typeof sendEmail = async (args) => {
      calls.push(args);
      return { ok: true };
    };
    await releaseThumbtackLeadToPipeline(leadId, spy);
    expect(calls.length).toBe(1);
    expect(calls[0].subject).toContain("New lead");
    expect(calls[0].body).toContain("Thumbtack");
    expect(calls[0].body).not.toMatch(/^Email:/m); // never an Email line for Thumbtack

    const releasedLead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(releasedLead.quarantined).toBe(false);

    const funnelAfterRelease = await getLeadFunnelBySource();
    const thumbtackAfterRelease = funnelAfterRelease.find((f) => f.source === "THUMBTACK");
    expect(thumbtackAfterRelease?.total ?? 0).toBe((thumbtackBefore?.total ?? 0) + 1);

    // Now mark it as test — released or not, isTest excludes it forever.
    await markThumbtackLeadAsTest(leadId);
    const testedLead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(testedLead.isTest).toBe(true);
    expect(testedLead.quarantined).toBe(false); // unchanged by marking test

    const [kpisAfter, funnelAfterTest, csvAfter, lostAfter] = await Promise.all([
      loadLeadKpis(),
      getLeadFunnelBySource(),
      buildLeadExportCsv(),
      getLostLeads(),
    ]);
    expect(kpisAfter.needsAttention.some((a) => a.id === leadId)).toBe(false);
    const thumbtackAfterTest = funnelAfterTest.find((f) => f.source === "THUMBTACK");
    expect(thumbtackAfterTest?.total ?? 0).toBe(thumbtackBefore?.total ?? 0); // back down — excluded again
    expect(csvAfter).not.toContain(leadId);
    expect(lostAfter.some((l) => l.id === leadId)).toBe(false);
  });

  test("Release to pipeline is a conditional update — a double click or a second tab can only win the race once, and the alert never fires twice", async () => {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "true";
    process.env.SALES_NOTIFY_EMAIL = `owner-${RUN_ID}@example.com`;

    const result = await ingestThumbtackLead(parseThumbtackLeadBody(sampleLeadBody())!);
    const leadId = result.leadId!;
    createdIds.push(leadId);

    const calls: Parameters<typeof sendEmail>[0][] = [];
    const spy: typeof sendEmail = async (args) => {
      calls.push(args);
      return { ok: true };
    };

    // Two "clicks" racing — only one can match the conditional
    // (quarantined: true) where clause.
    const [first, second] = await Promise.all([
      releaseThumbtackLeadToPipeline(leadId, spy),
      releaseThumbtackLeadToPipeline(leadId, spy),
    ]);
    const releasedCount = [first.released, second.released].filter(Boolean).length;
    expect(releasedCount).toBe(1);
    expect(calls.length).toBe(1); // the alert fired exactly once, not twice

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.quarantined).toBe(false);

    // A third, later call finds nothing left to release.
    const third = await releaseThumbtackLeadToPipeline(leadId, spy);
    expect(third.released).toBe(false);
    expect(calls.length).toBe(1); // still exactly once
  });

  // shouldAlertAfterRelease is the post-read decision
  // releaseThumbtackLeadToPipeline makes right before calling notifyNewLead
  // — it exists so a lead marked test in the gap between the updateMany
  // above committing and the re-read still doesn't get the team alert.
  // There's no way to make that updateMany match (isTest: false in its own
  // WHERE) while the re-read sees isTest: true without landing a real write
  // in that exact gap — not something a single-process test can force
  // without editing the function under test — so this is covered as a
  // direct, exhaustive unit test of the extracted decision instead; the
  // test above already covers the updateMany race itself.
  test("shouldAlertAfterRelease: false once isTest is true, true otherwise — this is what keeps a lead marked test in the gap between Release's own update and its re-read from still alerting the team", () => {
    expect(shouldAlertAfterRelease({ isTest: true })).toBe(false);
    expect(shouldAlertAfterRelease({ isTest: false })).toBe(true);
  });

  test("Mark as test and Release to pipeline are both restricted to source: THUMBTACK — a non-Thumbtack lead is never affected", async () => {
    const websiteLead = await prisma.lead.create({
      data: {
        firstName: "Website",
        lastName: `Lead-${RUN_ID}`,
        email: `website-${RUN_ID}@example.com`,
        phone: "9495550000",
        source: "WEBSITE_FORM",
      },
    });

    try {
      const markResult = await markThumbtackLeadAsTest(websiteLead.id);
      expect(markResult.marked).toBe(false);
      const releaseResult = await releaseThumbtackLeadToPipeline(websiteLead.id);
      expect(releaseResult.released).toBe(false);

      const reloaded = await prisma.lead.findUniqueOrThrow({ where: { id: websiteLead.id } });
      expect(reloaded.isTest).toBe(false);
      expect(reloaded.quarantined).toBe(false);
    } finally {
      await prisma.lead.delete({ where: { id: websiteLead.id } });
    }
  });

  test("a lead confirmed as test can never be released to the normal pipeline/alert, even after an Admin releases-then-marks it", async () => {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "true";
    process.env.SALES_NOTIFY_EMAIL = `owner-${RUN_ID}@example.com`;

    const calls: Parameters<typeof sendEmail>[0][] = [];
    const spy: typeof sendEmail = async (args) => {
      calls.push(args);
      return { ok: true };
    };

    const result = await ingestThumbtackLead(parseThumbtackLeadBody(sampleLeadBody())!, spy);
    const leadId = result.leadId!;
    createdIds.push(leadId);
    // The quiet owner-only held notice from ingest is expected here — not
    // what this test is checking.

    await markThumbtackLeadAsTest(leadId);
    const beforeRelease = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(beforeRelease.isTest).toBe(true);
    expect(beforeRelease.quarantined).toBe(true); // marking test never clears quarantined on its own

    const funnelBefore = await getLeadFunnelBySource();
    const kpisBefore = await loadLeadKpis();
    expect(kpisBefore.needsAttention.some((a) => a.id === leadId)).toBe(false);

    calls.length = 0; // reset — only Release's own alert (or lack of it) matters below

    const released = await releaseThumbtackLeadToPipeline(leadId, spy);
    expect(released.released).toBe(false);
    expect(calls.length).toBe(0); // the normal team alert never fired

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(after.quarantined).toBe(true); // still held — isTest: false in the WHERE blocked the update
    expect(after.isTest).toBe(true);

    // The refused release left the funnel/KPI exclusion exactly as it was —
    // no row crossed from excluded to counted.
    const funnelAfter = await getLeadFunnelBySource();
    const kpisAfter = await loadLeadKpis();
    expect(funnelAfter.find((f) => f.source === "THUMBTACK")?.total ?? 0).toBe(
      funnelBefore.find((f) => f.source === "THUMBTACK")?.total ?? 0
    );
    expect(kpisAfter.needsAttention.some((a) => a.id === leadId)).toBe(false);
  });

  test("a delivery confirmed as Thumbtack's own test never alerts the sales team, even with quarantine OFF — only the quiet owner-only notice fires", async () => {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "false";
    process.env.SALES_NOTIFY_EMAIL = `owner-${RUN_ID}@example.com`;

    const calls: Parameters<typeof sendEmail>[0][] = [];
    const spy: typeof sendEmail = async (args) => {
      calls.push(args);
      return { ok: true };
    };

    // isTest forced true directly on the parsed object — isExplicitTestMarker
    // itself always returns false today (no confirmed real field name yet,
    // see this file's own header comment), so this exercises
    // ingestThumbtackLead's own isTest handling independent of that.
    const funnelBefore = await getLeadFunnelBySource();
    const parsed = { ...parseThumbtackLeadBody(sampleLeadBody())!, isTest: true };
    const result = await ingestThumbtackLead(parsed, spy);
    const leadId = result.leadId!;
    createdIds.push(leadId);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.quarantined).toBe(false); // quarantine was off
    expect(lead.isTest).toBe(true);

    // Not a raw zero count — the owner's own quiet notice is allowed and
    // expected. What's actually being proven: no call ever reaches a sales
    // rep or Office Assistant address (no bcc list, "to" is only the owner).
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.to).toBe(process.env.SALES_NOTIFY_EMAIL);
      expect(call.bcc ?? []).toHaveLength(0);
    }

    // Excluded from the funnel like any other isTest lead — the new lead
    // never moved the Thumbtack total, despite "created" being the outcome.
    const funnelAfter = await getLeadFunnelBySource();
    expect(funnelAfter.find((f) => f.source === "THUMBTACK")?.total ?? 0).toBe(
      funnelBefore.find((f) => f.source === "THUMBTACK")?.total ?? 0
    );
    const kpis = await loadLeadKpis();
    expect(kpis.needsAttention.some((a) => a.id === leadId)).toBe(false);
  });
});

// Hiding a quarantined/test lead from the UI was never real access control
// on its own — getAccessibleLead/isLeadContactBlocked are the actual guard
// now called at the top of every action in src/app/(portal)/sales/leads/
// actions.ts, src/app/actions/scheduledMessages.ts's authorizeRecipient,
// and src/lib/scheduledMessageScheduler.ts's sender. This block tests that
// shared guard directly and exhaustively (every role x every lead state);
// the browser-level describe block further below proves a representative
// sample of the actions that call it are actually wired up correctly.
function fakeSession(role: SessionPayload["role"]): SessionPayload {
  return { sub: `fake-${role.toLowerCase()}-${RUN_ID}`, role, language: "EN", name: `Fake ${role}` };
}

test.describe("Thumbtack webhook: shared lead-access guard (direct lib calls)", () => {
  const createdIds: string[] = [];

  test.afterAll(async () => {
    for (const id of createdIds) await cleanupLead(id);
  });

  test("a quarantined lead is invisible (not-found) to every non-Admin role, visible to Admin", async () => {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "true";
    const result = await ingestThumbtackLead(parseThumbtackLeadBody(sampleLeadBody())!);
    const leadId = result.leadId!;
    createdIds.push(leadId);

    expect(await getAccessibleLead(leadId, fakeSession("SALES_REP"))).toBeNull();
    expect(await getAccessibleLead(leadId, fakeSession("OFFICE_ASSISTANT"))).toBeNull();
    expect(await getAccessibleLead(leadId, fakeSession("SERVICE_MANAGER"))).toBeNull();
    expect((await getAccessibleLead(leadId, fakeSession("ADMIN")))?.id).toBe(leadId);
  });

  test("an isTest lead (even once released from quarantine) is invisible to every non-Admin role, visible to Admin", async () => {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "false";
    const result = await ingestThumbtackLead(parseThumbtackLeadBody(sampleLeadBody())!);
    const leadId = result.leadId!;
    createdIds.push(leadId);
    await markThumbtackLeadAsTest(leadId);

    expect(await getAccessibleLead(leadId, fakeSession("SALES_REP"))).toBeNull();
    expect(await getAccessibleLead(leadId, fakeSession("OFFICE_ASSISTANT"))).toBeNull();
    expect((await getAccessibleLead(leadId, fakeSession("ADMIN")))?.id).toBe(leadId);
  });

  test("a normal (never quarantined/test) lead is visible to every role", async () => {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "false";
    const result = await ingestThumbtackLead(parseThumbtackLeadBody(sampleLeadBody())!);
    const leadId = result.leadId!;
    createdIds.push(leadId);

    expect((await getAccessibleLead(leadId, fakeSession("SALES_REP")))?.id).toBe(leadId);
    expect((await getAccessibleLead(leadId, fakeSession("OFFICE_ASSISTANT")))?.id).toBe(leadId);
    expect((await getAccessibleLead(leadId, fakeSession("ADMIN")))?.id).toBe(leadId);
  });

  test("a genuinely missing lead id is null for every role, Admin included", async () => {
    expect(await getAccessibleLead("not-a-real-lead-id", fakeSession("ADMIN"))).toBeNull();
    expect(await getAccessibleLead("not-a-real-lead-id", fakeSession("SALES_REP"))).toBeNull();
  });

  test("contact is blocked for a quarantined or isTest lead, for every role including Admin; never blocked for a normal lead", () => {
    expect(isLeadContactBlocked({ quarantined: true, isTest: false })).toBe(true);
    expect(isLeadContactBlocked({ quarantined: false, isTest: true })).toBe(true);
    expect(isLeadContactBlocked({ quarantined: true, isTest: true })).toBe(true);
    expect(isLeadContactBlocked({ quarantined: false, isTest: false })).toBe(false);
  });
});

test.describe("Thumbtack webhook: scheduled-message sender refuses a quarantined/test lead (direct lib calls)", () => {
  const createdLeadIds: string[] = [];
  const createdMessageIds: string[] = [];

  test.afterAll(async () => {
    await prisma.scheduledMessage.deleteMany({ where: { id: { in: createdMessageIds } } });
    for (const id of createdLeadIds) await cleanupLead(id);
  });

  test("a PENDING message queued for a lead that's since been quarantined (or confirmed test) is cancelled at send time, never sent, for any role that scheduled it", async () => {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "false";
    const result = await ingestThumbtackLead(parseThumbtackLeadBody(sampleLeadBody())!);
    const leadId = result.leadId!;
    createdLeadIds.push(leadId);

    const adminId = (await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } })).id;
    const msg = await prisma.scheduledMessage.create({
      data: {
        leadId,
        channel: "EMAIL",
        subject: "Following up",
        body: "Hi there",
        sendAt: new Date(Date.now() - 1000),
        createdById: adminId,
      },
    });
    createdMessageIds.push(msg.id);

    // Confirmed test after scheduling — the sender must still refuse it.
    await markThumbtackLeadAsTest(leadId);

    let sent = false;
    await processScheduledMessage(msg.id, new Date(), {
      sendEmail: async () => {
        sent = true;
        return { ok: true };
      },
      sendSms: async () => {
        sent = true;
        return { ok: true };
      },
    });

    expect(sent).toBe(false);
    const reloaded = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(reloaded.status).toBe("CANCELLED");
    expect(reloaded.cancelReason).toContain("quarantine");
  });
});

test.describe("Thumbtack webhook: a no-email lead's basic handling elsewhere in the app (direct lib calls)", () => {
  test("maybeSendAfterHoursAutoReply tolerates a lead with no email, and a blank email never matches another blank-email lead", async () => {
    const sundayNight = new Date("2026-11-29T20:00:00-08:00"); // outside business hours regardless of config

    const otherBlankEmailWon = await prisma.lead.create({
      data: {
        firstName: "Other",
        lastName: `Blank-${RUN_ID}`,
        email: null,
        phone: `949555${Math.floor(1000 + Math.random() * 8999)}`,
        source: "THUMBTACK",
        stage: "WON",
      },
    });

    const subject = await prisma.lead.create({
      data: {
        firstName: "Subject",
        lastName: `NoEmail-${RUN_ID}`,
        email: null,
        phone: `949555${Math.floor(1000 + Math.random() * 8999)}`, // deliberately different from the WON lead above
        source: "THUMBTACK",
      },
    });

    try {
      await expect(
        maybeSendAfterHoursAutoReply({ id: subject.id, email: subject.email, phone: subject.phone }, sundayNight)
      ).resolves.not.toThrow();

      // A real attempt was logged — proof the blank email on `otherBlankEmailWon`
      // was never treated as a match (which would have suppressed this
      // silently, same as a genuine existing-client match does).
      const comm = await prisma.leadCommunication.findFirstOrThrow({ where: { leadId: subject.id } });
      expect(comm.channel).toBe("SMS");

      const reloaded = await prisma.lead.findUniqueOrThrow({ where: { id: subject.id } });
      expect(reloaded.autoReplySentAt).not.toBeNull();
    } finally {
      await prisma.leadCommunication.deleteMany({ where: { leadId: { in: [subject.id, otherBlankEmailWon.id] } } });
      await prisma.lead.deleteMany({ where: { id: { in: [subject.id, otherBlankEmailWon.id] } } });
    }
  });
});

test.describe("Thumbtack webhook: HTTP receiver (secret, routing, response codes)", () => {
  test.skip(!WEBHOOK_SECRET, "THUMBTACK_WEBHOOK_SECRET isn't configured in this environment");

  const createdIds: string[] = [];

  test.afterAll(async () => {
    for (const id of createdIds) await cleanupLead(id);
  });

  test("a missing secret header is rejected with 401; a wrong value is rejected; the correct value is accepted", async ({ request }) => {
    const bodyNoHeader = sampleLeadBody();
    const noHeaderRes = await request.post(WEBHOOK_URL, { data: bodyNoHeader });
    expect(noHeaderRes.status()).toBe(401);
    expect(await prisma.lead.count({ where: { externalId: bodyNoHeader.negotiationID } })).toBe(0);

    const bodyWrongHeader = sampleLeadBody();
    const wrongHeaderRes = await request.post(WEBHOOK_URL, {
      headers: { [THUMBTACK_SECRET_HEADER]: "definitely-not-the-real-secret" },
      data: bodyWrongHeader,
    });
    expect(wrongHeaderRes.status()).toBe(401);
    expect(await prisma.lead.count({ where: { externalId: bodyWrongHeader.negotiationID } })).toBe(0);

    const bodyCorrect = sampleLeadBody();
    const correctRes = await request.post(WEBHOOK_URL, {
      headers: { [THUMBTACK_SECRET_HEADER]: WEBHOOK_SECRET },
      data: bodyCorrect,
    });
    expect(correctRes.status()).toBe(200);
    const created = await prisma.lead.findFirst({ where: { externalId: bodyCorrect.negotiationID } });
    expect(created).not.toBeNull();
    createdIds.push(created!.id);
  });

  test("a Message event (no request object at all) creates nothing and still returns 2xx", async ({ request }) => {
    const body = sampleMessageBody();
    const res = await request.post(WEBHOOK_URL, {
      headers: { [THUMBTACK_SECRET_HEADER]: WEBHOOK_SECRET },
      data: body,
    });
    expect(res.status()).toBe(200);
    expect(await prisma.lead.count({ where: { externalId: body.negotiationID } })).toBe(0);
  });

  test("an unrecognized shape (e.g. a Review event) returns a non-2xx — never a silent success", async ({ request }) => {
    const res = await request.post(WEBHOOK_URL, {
      headers: { [THUMBTACK_SECRET_HEADER]: WEBHOOK_SECRET },
      data: { negotiationID: `negotiation-${RUN_ID}-unknown`, reviewID: "fake", rating: 5 },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("a Lead-typed event that can't actually be saved (no negotiationID) returns a non-2xx", async ({ request }) => {
    const res = await request.post(WEBHOOK_URL, {
      headers: { [THUMBTACK_SECRET_HEADER]: WEBHOOK_SECRET },
      data: { request: { requestID: "x" }, leadPrice: "$10" }, // no negotiationID at all
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("two deliveries with the same negotiationID fired at the same time end with exactly one lead and no 500", async ({
    request,
  }) => {
    const body = sampleLeadBody();
    const [resA, resB] = await Promise.all([
      request.post(WEBHOOK_URL, { headers: { [THUMBTACK_SECRET_HEADER]: WEBHOOK_SECRET }, data: body }),
      request.post(WEBHOOK_URL, { headers: { [THUMBTACK_SECRET_HEADER]: WEBHOOK_SECRET }, data: body }),
    ]);
    expect(resA.status()).toBeLessThan(300);
    expect(resB.status()).toBeLessThan(300);

    const leads = await prisma.lead.findMany({ where: { externalId: body.negotiationID } });
    expect(leads).toHaveLength(1);
    createdIds.push(leads[0].id);
  });

  test("the real delivery's own shape (estimate + refundRequestLink on top of the existing fields) is still accepted and saved exactly as today", async ({
    request,
  }) => {
    const body = sampleRealDeliveryShapeLeadBody();
    expect(getThumbtackEventType(body)).toBe("LEAD");
    const parsed = parseThumbtackLeadBody(body);
    expect(parsed).not.toBeNull();
    expect(parsed!.negotiationID).toBe(body.negotiationID);
    expect(parsed!.leadPrice).toBe(24.5);

    const res = await request.post(WEBHOOK_URL, {
      headers: { [THUMBTACK_SECRET_HEADER]: WEBHOOK_SECRET },
      data: body,
    });
    expect(res.status()).toBe(200);
    const created = await prisma.lead.findFirst({ where: { externalId: body.negotiationID } });
    expect(created).not.toBeNull();
    createdIds.push(created!.id);
  });

  test("a wrong secret header is still refused with 401 even when the body itself is unparseable — proving the body is never read before the auth check", async ({
    request,
  }) => {
    const res = await request.post(WEBHOOK_URL, {
      headers: { [THUMBTACK_SECRET_HEADER]: "definitely-not-the-real-secret", "content-type": "application/json" },
      data: "{ not even valid json",
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("Thumbtack webhook: failure diagnostics and owner alert (direct lib calls)", () => {
  test.beforeEach(() => {
    resetThumbtackAlertState();
  });

  test("auth-rejected diagnostics: logs only header presence/length and content-length — never the header value", () => {
    const lines = captureConsoleLog(() => {
      logThumbtackAuthRejectedDiagnostics({
        headerPresent: true,
        headerLength: 47,
        contentLength: "812",
      });
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("auth-rejected");
    expect(lines[0]).toContain("headerPresent=true");
    expect(lines[0]).toContain("headerLength=47");
    expect(lines[0]).toContain("contentLength=812");
    // Never the real secret value, by construction — this call site has
    // no parameter that could carry it.
    expect(lines[0]).not.toContain("fake-secret-value-should-never-appear");
  });

  test("auth-rejected diagnostics: a missing header logs headerPresent=false headerLength=0", () => {
    const lines = captureConsoleLog(() => {
      logThumbtackAuthRejectedDiagnostics({ headerPresent: false, headerLength: 0, contentLength: null });
    });
    expect(lines[0]).toContain("headerPresent=false");
    expect(lines[0]).toContain("headerLength=0");
    expect(lines[0]).toContain("contentLength=none");
  });

  test("body diagnostics: a malformed-JSON failure logs only the error class, never the parse-error message text", () => {
    let errorClass = "";
    try {
      JSON.parse("{ not valid json, fake-secret: abc123");
    } catch (err) {
      errorClass = err instanceof Error ? err.constructor.name : "UnknownError";
    }
    const lines = captureConsoleLog(() => {
      logThumbtackBodyDiagnostics({
        contentType: "application/json",
        contentEncoding: null,
        byteLength: 38,
        parseOk: false,
        parseErrorClass: errorClass,
      });
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("parseOk=false");
    expect(lines[0]).toContain(`errorClass=${errorClass}`);
    expect(lines[0]).toBe("[thumbtack-webhook] body-diagnostics contentType=application/json contentEncoding=none bytes=38 parseOk=false errorClass=SyntaxError");
  });

  test("body diagnostics: a real-shaped Lead body reports every allowlisted key's type, counts (never names) an unknown key, and never logs accessCode or any value", () => {
    const body = sampleRealDeliveryShapeLeadBody();
    const lines = captureConsoleLog(() => {
      logThumbtackBodyDiagnostics({
        contentType: "application/json",
        contentEncoding: null,
        byteLength: 999,
        parseOk: true,
        parsedBody: body,
      });
    });
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line).toContain("parseOk=true");
    expect(line).toContain("topType=object");
    expect(line).toContain("negotiationID=string");
    expect(line).toContain("createdAt=string");
    expect(line).toContain("customer=object");
    expect(line).toContain("business=object");
    expect(line).toContain("request=object");
    expect(line).toContain("status=string");
    expect(line).toContain("leadPrice=string");
    expect(line).toContain("leadPriceBreakdown=object");
    expect(line).toContain("chargeState=string");
    expect(line).toContain("requestReviewLink=string");
    expect(line).toContain("refundRequestLink=string");
    expect(line).toContain("messageID=missing"); // a Lead body has no messageID
    expect(line).toContain("estimate=object");
    // accessCode is the one key in this body not on the allowlist — it
    // must be counted, never named.
    expect(line).toContain("otherKeys=1");
    expect(line).not.toContain("accessCode");
    expect(line).not.toContain(body.negotiationID); // never a body value
    expect(line).not.toContain("fake-access-code-not-real"); // never a body value
  });

  test("body diagnostics: an UNKNOWN shape (e.g. a Review event) still reports the allowlisted keys it does/doesn't have, missing ones marked missing", () => {
    const reviewLikeBody = { negotiationID: `negotiation-${RUN_ID}-review`, reviewID: "fake-review-id", rating: 5 };
    const lines = captureConsoleLog(() => {
      logThumbtackBodyDiagnostics({
        contentType: "application/json",
        contentEncoding: null,
        byteLength: 120,
        parseOk: true,
        parsedBody: reviewLikeBody,
      });
    });
    const line = lines[0];
    expect(line).toContain("negotiationID=string");
    expect(line).toContain("request=missing");
    expect(line).toContain("customer=missing");
    // reviewID and rating aren't on the allowlist — counted, never named.
    expect(line).toContain("otherKeys=2");
    expect(line).not.toContain("reviewID");
    expect(line).not.toContain("rating");
  });

  test("body diagnostics: a top-level array reports its length and element-0 type only", () => {
    const lines = captureConsoleLog(() => {
      logThumbtackBodyDiagnostics({
        contentType: "application/json",
        contentEncoding: null,
        byteLength: 20,
        parseOk: true,
        parsedBody: [{ negotiationID: "fake" }, { negotiationID: "fake2" }],
      });
    });
    expect(lines[0]).toContain("topType=array");
    expect(lines[0]).toContain("length=2");
    expect(lines[0]).toContain("elem0Type=object");
  });

  test("body diagnostics: a top-level string reports its length and whether it reparses as JSON, nothing else", () => {
    const doubleEncoded = JSON.stringify({ negotiationID: "fake" });
    const linesReparses = captureConsoleLog(() => {
      logThumbtackBodyDiagnostics({
        contentType: "application/json",
        contentEncoding: null,
        byteLength: doubleEncoded.length,
        parseOk: true,
        parsedBody: doubleEncoded,
      });
    });
    expect(linesReparses[0]).toContain("topType=string");
    expect(linesReparses[0]).toContain(`length=${doubleEncoded.length}`);
    expect(linesReparses[0]).toContain("reparsesAsJson=yes");

    const linesPlain = captureConsoleLog(() => {
      logThumbtackBodyDiagnostics({
        contentType: "application/json",
        contentEncoding: null,
        byteLength: 11,
        parseOk: true,
        parsedBody: "not json at all",
      });
    });
    expect(linesPlain[0]).toContain("reparsesAsJson=no");
  });

  test("owner alert: each distinct failure reason sends exactly one Slack DM through the injected function, never a second time for a repeat within 60 minutes", async () => {
    const calls: string[] = [];
    const spy = async (text: string) => {
      calls.push(text);
    };
    const reasons: ThumbtackSaveFailureReason[] = [
      "malformed_json",
      "unrecognized_shape",
      "missing_negotiation_id",
      "save_failed",
    ];
    const baseNow = Date.now();
    for (const reason of reasons) {
      await maybeAlertOwnerOfThumbtackSaveFailure(reason, spy, baseNow);
    }
    expect(calls).toHaveLength(4);
    expect(calls.every((c) => c === "A Thumbtack delivery could not be saved. Check Thumbtack directly.")).toBe(true);

    // A repeat of the same reason 1 minute later — still within the
    // reason's own 60-minute window — does not alert again.
    await maybeAlertOwnerOfThumbtackSaveFailure("malformed_json", spy, baseNow + 60_000);
    expect(calls).toHaveLength(4);

    // Just past 60 minutes, the same reason can alert again.
    await maybeAlertOwnerOfThumbtackSaveFailure("malformed_json", spy, baseNow + 61 * 60_000);
    expect(calls).toHaveLength(5);
  });

  test("owner alert: the 6th alert within a rolling hour is refused by the global cap", async () => {
    const calls: string[] = [];
    const spy = async (text: string) => {
      calls.push(text);
    };
    const baseNow = Date.now();
    // Only 4 real failure reasons exist, and the per-reason dedupe already
    // forces a 60+ minute gap between two firings of the SAME reason —
    // together that caps real traffic at 4 alerts per rolling hour, below
    // the global cap of 5, so the global cap can never be the binding
    // constraint using only real reason values within one window. To test
    // its own arithmetic in isolation, this uses a series of distinct
    // synthetic reason strings (cast past the real 4-value union) fired a
    // second apart — each is a first-time reason, so none is blocked by
    // the per-reason dedupe; only the global cap can refuse any of them.
    for (let i = 0; i < 5; i++) {
      await maybeAlertOwnerOfThumbtackSaveFailure(
        `synthetic-reason-${i}` as ThumbtackSaveFailureReason,
        spy,
        baseNow + i * 1000
      );
    }
    expect(calls).toHaveLength(5);

    await maybeAlertOwnerOfThumbtackSaveFailure("synthetic-reason-5" as ThumbtackSaveFailureReason, spy, baseNow + 5000);
    expect(calls).toHaveLength(5); // the 6th, still within the hour, is refused

    // Well past the hour, the cap has room again.
    await maybeAlertOwnerOfThumbtackSaveFailure(
      "synthetic-reason-6" as ThumbtackSaveFailureReason,
      spy,
      baseNow + 61 * 60_000
    );
    expect(calls).toHaveLength(6);
  });

  test("owner alert: never anything but the injected Slack function — no email, no team/BCC alert, by construction (the function takes no other sender)", async () => {
    const calls: string[] = [];
    const spy = async (text: string) => {
      calls.push(text);
    };
    await maybeAlertOwnerOfThumbtackSaveFailure("save_failed", spy, Date.now());
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("@"); // no email address embedded in the text
    expect(calls[0]).toBe("A Thumbtack delivery could not be saved. Check Thumbtack directly.");
  });
});

test.describe.serial("Thumbtack webhook: quarantine visibility and admin-only actions (browser)", () => {
  let originalQuarantineFlag: string | undefined;
  const createdIds: string[] = [];
  let salesRepId: string;
  let officeAssistantId: string;
  const salesRepEmail = `thumbtack-salesrep-${RUN_ID}@example.com`;
  const officeAssistantEmail = `thumbtack-oa-${RUN_ID}@example.com`;

  test.beforeAll(async () => {
    originalQuarantineFlag = process.env.THUMBTACK_QUARANTINE_ENABLED;
    const salesRep = await prisma.user.create({
      data: {
        email: salesRepEmail,
        name: `Thumbtack Sales Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = salesRep.id;

    const officeAssistant = await prisma.user.create({
      data: {
        email: officeAssistantEmail,
        name: `Thumbtack OA ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        areaAccess: { create: [{ area: "SALES_LEADS", canEdit: true }] },
      },
    });
    officeAssistantId = officeAssistant.id;
  });

  test.afterAll(async () => {
    if (originalQuarantineFlag === undefined) delete process.env.THUMBTACK_QUARANTINE_ENABLED;
    else process.env.THUMBTACK_QUARANTINE_ENABLED = originalQuarantineFlag;
    for (const id of createdIds) await cleanupLead(id);
    await prisma.user.deleteMany({ where: { id: { in: [salesRepId, officeAssistantId] } } });
  });

  test("a quarantined lead is invisible to a Sales Rep (reads as not-found) and absent from the pipeline board; Admin sees the quarantine banner and can release it", async ({
    page,
  }) => {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "true";
    const uniqueName = `ThumbtackQuarantine${RUN_ID}`;
    const result = await ingestThumbtackLead(
      parseThumbtackLeadBody(sampleLeadBody({ customer: { firstName: uniqueName, lastName: "Customer" } }))!
    );
    const leadId = result.leadId!;
    createdIds.push(leadId);

    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    await expect(page.getByText("Lead not found")).toBeVisible();
    await page.goto("/sales/leads");
    await expect(page.getByText(uniqueName)).toHaveCount(0);
    await logout(page);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    await expect(page.getByText("Held for review")).toBeVisible();
    await page.click('button:has-text("Release to pipeline")');
    await expect(page.getByText("Held for review")).toHaveCount(0);

    const released = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(released.quarantined).toBe(false);
    await logout(page);

    // Now visible to the Sales Rep, same as any other released lead.
    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    await expect(page.getByText("Lead not found")).toHaveCount(0);
    await logout(page);
  });

  test("Admin's 'Mark as test' works on a released Thumbtack lead too", async ({ page }) => {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "false";
    const result = await ingestThumbtackLead(parseThumbtackLeadBody(sampleLeadBody())!);
    const leadId = result.leadId!;
    createdIds.push(leadId);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    await page.click('button:has-text("Mark as test")');
    await page.waitForTimeout(500);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.isTest).toBe(true);
    await logout(page);
  });

  // The authorization-gap matrix (item 5): a real, well-formed Server
  // Action request is captured while legitimately performed by ADMIN
  // against a quarantined (or isTest) lead — the only role that can reach
  // it at all — then replayed verbatim under a different session's
  // cookies. A non-2xx (surfaced as a thrown error) plus an unchanged
  // write-count proves the shared guard, not just the page's own hidden
  // controls, is what refuses it.
  async function freshQuarantinedLead(): Promise<string> {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "true";
    const result = await ingestThumbtackLead(parseThumbtackLeadBody(sampleLeadBody())!);
    createdIds.push(result.leadId!);
    return result.leadId!;
  }

  async function freshIsTestLead(): Promise<string> {
    process.env.THUMBTACK_QUARANTINE_ENABLED = "false";
    const result = await ingestThumbtackLead(parseThumbtackLeadBody(sampleLeadBody())!);
    const leadId = result.leadId!;
    createdIds.push(leadId);
    await markThumbtackLeadAsTest(leadId);
    return leadId;
  }

  test("setLeadStageAction: a real Admin stage-change on a quarantined lead, replayed as Sales Rep, is refused and writes nothing further", async ({
    page,
  }) => {
    const leadId = await freshQuarantinedLead();

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    const captured = await captureAction(page, async () => {
      await page.click('button:has-text("Move to: Contacted")');
    });
    const afterAdmin = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(afterAdmin.stage, "control: Admin's own change must have written").toBe("CONTACTED");
    await logout(page);

    await loginAs(page, salesRepEmail, PASSWORD);
    const replayRes = await replayAction(page, `/sales/leads/${leadId}`, captured);
    expect(replayRes.status()).toBe(500);
    const changeCount = await prisma.leadStageChange.count({ where: { leadId } });
    expect(changeCount, "only Admin's own stage change exists").toBe(1);
    await logout(page);
  });

  test("setLeadStageAction replayed as Sales Rep is refused the same way for an isTest lead, even though it's not quarantined", async ({
    page,
  }) => {
    const leadId = await freshIsTestLead();

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    const captured = await captureAction(page, async () => {
      await page.click('button:has-text("Move to: Contacted")');
    });
    await logout(page);

    await loginAs(page, salesRepEmail, PASSWORD);
    const replayRes = await replayAction(page, `/sales/leads/${leadId}`, captured);
    expect(replayRes.status()).toBe(500);
    const changeCount = await prisma.leadStageChange.count({ where: { leadId } });
    expect(changeCount).toBe(1);
    await logout(page);
  });

  test("markLeadScamAction: a real Admin Scam classification on a quarantined lead, replayed as Sales Rep, is refused and writes nothing further", async ({
    page,
  }) => {
    const leadId = await freshQuarantinedLead();

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    page.once("dialog", (d) => d.accept());
    const captured = await captureAction(page, async () => {
      await page.click('button:has-text("Mark as Scam")');
      await page.click('button:has-text("Confirm: Mark as Scam")');
    });
    const afterAdmin = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(afterAdmin.stage, "control: Admin's own classification must have written").toBe("SCAM");
    await logout(page);

    await loginAs(page, salesRepEmail, PASSWORD);
    const replayRes = await replayAction(page, `/sales/leads/${leadId}`, captured);
    expect(replayRes.status()).toBe(500);
    const changeCount = await prisma.leadStageChange.count({ where: { leadId, toStage: "SCAM" } });
    expect(changeCount, "only Admin's own classification exists").toBe(1);
    await logout(page);
  });

  test("sendLeadEmailAction: blocked for Admin's own attempt too (contact is blocked for everyone); replaying as Sales Rep is refused outright and never even reaches that check", async ({
    page,
  }) => {
    const leadId = await freshQuarantinedLead();

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    const captured = await captureAction(page, async () => {
      await page.click('button:has-text("Send Email")');
      await page.fill('input[name="subject"]', "Following up");
      // Scoped by placeholder, not just [name="body"] — the lead-notes
      // form on the same page also has a textarea[name="body"], and a bare
      // selector would match both and fail Playwright's strict mode.
      await page.fill('textarea[name="body"][placeholder="Message"]', "Hi there");
      await page.click('button:has-text("Send Email"):below(textarea[placeholder="Message"])');
    });
    const commsAfterAdmin = await prisma.leadCommunication.findMany({ where: { leadId } });
    expect(commsAfterAdmin, "control: Admin's own attempt is blocked, logged as FAILED").toHaveLength(1);
    expect(commsAfterAdmin[0].status).toBe("FAILED");
    expect(commsAfterAdmin[0].errorMessage).toContain("quarantine");
    await logout(page);

    await loginAs(page, salesRepEmail, PASSWORD);
    const replayRes = await replayAction(page, `/sales/leads/${leadId}`, captured);
    expect(replayRes.status()).toBe(500);
    const commsAfterReplay = await prisma.leadCommunication.count({ where: { leadId } });
    expect(commsAfterReplay, "no additional attempt was logged").toBe(1);
    await logout(page);
  });

  test("setLeadAssignmentAction: a real Admin reassignment on a quarantined lead, replayed as Sales Rep, is refused and writes nothing further", async ({
    page,
  }) => {
    const leadId = await freshQuarantinedLead();

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    const captured = await captureAction(page, async () => {
      await page.selectOption('select:near(:text("Assigned to"))', salesRepId);
    });
    const afterAdmin = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(afterAdmin.assignedToId, "control: Admin's own assignment must have written").toBe(salesRepId);
    await logout(page);

    await loginAs(page, salesRepEmail, PASSWORD);
    const replayRes = await replayAction(page, `/sales/leads/${leadId}`, captured);
    expect(replayRes.status()).toBe(500);
    const afterReplay = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(afterReplay.assignedToId).toBe(salesRepId); // unchanged
    await logout(page);
  });

  test("updateLeadContactInfoAction: a real Admin contact correction on a quarantined lead, replayed as Office Assistant, is refused and writes nothing further", async ({
    page,
  }) => {
    const leadId = await freshQuarantinedLead();
    const newEmail = `thumbtack-corrected-${RUN_ID}@example.com`;

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    await page.click("text=Edit contact info");
    // Scoped to the contact-editor's own <form> — the lead page also has
    // an unrelated "Save" button (deal details), and a bare
    // button:has-text("Save") matches both, failing Playwright's strict mode.
    const contactForm = page.locator("form").filter({ has: page.locator('input[name="email"]') });
    const captured = await captureAction(page, async () => {
      await contactForm.locator('input[name="email"]').fill(newEmail);
      await contactForm.locator('input[name="phone"]').fill("9495551234");
      await contactForm.locator('button:has-text("Save")').click();
    });
    const afterAdmin = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(afterAdmin.email, "control: Admin's own correction must have written").toBe(newEmail);
    await logout(page);

    await loginAs(page, officeAssistantEmail, PASSWORD);
    const replayRes = await replayAction(page, `/sales/leads/${leadId}`, captured);
    // Unlike the other 5 actions in this matrix, updateLeadContactInfoAction
    // is wired through useFormState — a refusal is a normal 200 carrying a
    // serialized { error: "Lead not found." } state, not a thrown 500. The
    // real proof is the unchanged DB row below, not the status code.
    expect(replayRes.status()).toBeLessThan(300);
    const replayBody = await replayRes.text();
    expect(replayBody).toContain("Lead not found");
    const afterReplay = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(afterReplay.email).toBe(newEmail); // unchanged by the replay
    await logout(page);
  });

  test("updateLeadContactInfoAction replayed as Office Assistant is refused the same way for an isTest lead", async ({
    page,
  }) => {
    const leadId = await freshIsTestLead();
    const newEmail = `thumbtack-corrected-istest-${RUN_ID}@example.com`;

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    await page.click("text=Edit contact info");
    const contactForm = page.locator("form").filter({ has: page.locator('input[name="email"]') });
    const captured = await captureAction(page, async () => {
      await contactForm.locator('input[name="email"]').fill(newEmail);
      // A phone distinct from the other contact-info test's "9495551234" —
      // updateLeadContactInfoAction rejects a new phone number already
      // saved on a DIFFERENT lead, and both tests run against separate
      // leads in the same database.
      await contactForm.locator('input[name="phone"]').fill("9185551234");
      await contactForm.locator('button:has-text("Save")').click();
    });
    const afterAdmin = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(afterAdmin.email, "control: Admin's own correction must have written").toBe(newEmail);
    await logout(page);

    await loginAs(page, officeAssistantEmail, PASSWORD);
    const replayRes = await replayAction(page, `/sales/leads/${leadId}`, captured);
    expect(replayRes.status()).toBeLessThan(300);
    const replayBody = await replayRes.text();
    expect(replayBody).toContain("Lead not found");
    const afterReplay = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(afterReplay.email).toBe(newEmail);
    await logout(page);
  });

  test("addLeadNoteAction: a real Admin note on a quarantined lead, replayed as Office Assistant, is refused and writes nothing further", async ({
    page,
  }) => {
    const leadId = await freshQuarantinedLead();

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    const captured = await captureAction(page, async () => {
      await page.fill('textarea[name="body"]', "Admin's own note");
      await page.click('button:has-text("Add Note")');
    });
    const notesAfterAdmin = await prisma.leadNote.count({ where: { leadId } });
    expect(notesAfterAdmin, "control: Admin's own note must have written").toBe(1);
    await logout(page);

    await loginAs(page, officeAssistantEmail, PASSWORD);
    const replayRes = await replayAction(page, `/sales/leads/${leadId}`, captured);
    expect(replayRes.status()).toBe(500);
    const notesAfterReplay = await prisma.leadNote.count({ where: { leadId } });
    expect(notesAfterReplay, "no additional note was written").toBe(1);
    await logout(page);
  });

  test("sendLeadTextAction: blocked for Admin's own attempt too (contact is blocked for everyone); replaying as Sales Rep is refused outright and never even reaches sendSms", async ({
    page,
  }) => {
    const leadId = await freshQuarantinedLead();

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    const captured = await captureAction(page, async () => {
      await page.click('button:has-text("Send Text")');
      // Scoped by placeholder, not just [name="body"] — the lead-notes
      // form on the same page also has a textarea[name="body"], and a bare
      // selector would match both and fail Playwright's strict mode.
      await page.fill('textarea[name="body"][placeholder="Text message"]', "Following up by text");
      await page.click('button:has-text("Send Text"):below(textarea[placeholder="Text message"])');
    });
    const commsAfterAdmin = await prisma.leadCommunication.findMany({ where: { leadId } });
    // No way to spy on sendLeadTextAction's module-level sendSms import
    // directly (unlike sendEmailFn, it's not an injectable parameter) — the
    // real proof that sendSms was never reached is the same the existing
    // sendLeadEmailAction test above relies on: a blocked attempt is logged
    // as FAILED with the quarantine errorMessage, never a SENT row (which
    // only sendSms's own result could have produced).
    expect(commsAfterAdmin, "control: Admin's own attempt is blocked, logged as FAILED").toHaveLength(1);
    expect(commsAfterAdmin[0].status).toBe("FAILED");
    expect(commsAfterAdmin[0].channel).toBe("SMS");
    expect(commsAfterAdmin[0].errorMessage).toContain("quarantine");
    await logout(page);

    await loginAs(page, salesRepEmail, PASSWORD);
    const replayRes = await replayAction(page, `/sales/leads/${leadId}`, captured);
    expect(replayRes.status()).toBe(500);
    const commsAfterReplay = await prisma.leadCommunication.count({ where: { leadId } });
    expect(commsAfterReplay, "no additional attempt was logged").toBe(1);
    await logout(page);
  });

  test("scheduleMessageAction: refused for Admin too (scheduling is contact) and refused for Sales Rep ('Lead not found') on a quarantined lead — nothing is scheduled either way", async ({
    page,
  }) => {
    const leadId = await freshQuarantinedLead();

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/sales/leads/${leadId}`);
    await page.click('button:has-text("Send Text")');
    await page.fill('textarea[name="body"][placeholder="Text message"]', "Scheduled follow-up");
    await page.click('button:has-text("Schedule")'); // the toggle — "Schedule Send" doesn't exist yet
    const captured = await captureAction(page, async () => {
      await page.click('button:has-text("Tomorrow 9am")');
      await page.click('button:has-text("Schedule Send")');
    });
    // Admin's own attempt is refused too — scheduling IS customer contact,
    // blocked for everyone until the lead is released (not an existence
    // check, so the message is the quarantine one, not "Lead not found").
    await expect(page.locator("text=held in Thumbtack quarantine")).toBeVisible();
    const countAfterAdmin = await prisma.scheduledMessage.count({ where: { leadId } });
    expect(countAfterAdmin, "Admin's own attempt scheduled nothing").toBe(0);
    await logout(page);

    await loginAs(page, salesRepEmail, PASSWORD);
    const replayRes = await replayAction(page, `/sales/leads/${leadId}`, captured);
    expect(replayRes.status()).toBeLessThan(300); // a typed {ok:false} result, not a throw
    const replayBody = await replayRes.text();
    expect(replayBody).toContain("Lead not found");
    const countAfterReplay = await prisma.scheduledMessage.count({ where: { leadId } });
    expect(countAfterReplay, "replay as Sales Rep scheduled nothing").toBe(0);
    await logout(page);
  });

  test("updateScheduledMessageAction: a PENDING send on a lead quarantined after scheduling is refused for Admin (contact blocked) and for Sales Rep ('Lead not found') — the row is untouched", async ({
    page,
  }) => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } });
    const lead = await prisma.lead.create({
      data: {
        firstName: "PreQuarantine",
        lastName: `Lead-${RUN_ID}`,
        email: `prequarantine-${RUN_ID}@example.com`,
        phone: "9495550099",
        source: "WEBSITE_FORM",
      },
    });
    createdIds.push(lead.id);
    const uniqueBody = `Edit-test body ${RUN_ID}`;
    const msg = await prisma.scheduledMessage.create({
      data: {
        leadId: lead.id,
        channel: "SMS",
        body: uniqueBody,
        sendAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "PENDING",
        createdById: adminUser.id,
      },
    });
    // Seeded while open, THEN quarantined — matching a real Thumbtack hold
    // landing on a lead that already had something scheduled.
    await prisma.lead.update({ where: { id: lead.id }, data: { quarantined: true } });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/scheduled");
    const row = page.locator("div.rounded-lg.border.border-neutral-200.bg-white.p-4", { hasText: uniqueBody });
    await row.locator('button:has-text("Edit / Reschedule")').click();
    const captured = await captureAction(page, async () => {
      await row.locator("textarea").fill(`${uniqueBody} (edited)`);
      await row.locator('button:has-text("Save")').click();
    });
    await expect(row.locator("text=held in Thumbtack quarantine")).toBeVisible();
    const afterAdmin = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(afterAdmin.body, "Admin's own refused attempt wrote nothing").toBe(uniqueBody);
    await logout(page);

    await loginAs(page, salesRepEmail, PASSWORD);
    const replayRes = await replayAction(page, "/scheduled", captured);
    expect(replayRes.status()).toBeLessThan(300);
    const replayBody = await replayRes.text();
    expect(replayBody).toContain("Lead not found");
    const afterReplay = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(afterReplay.body, "Sales Rep replay wrote nothing").toBe(uniqueBody);
    expect(afterReplay.status).toBe("PENDING");
    await logout(page);
  });

  test("cancelScheduledMessageAction: on a lead quarantined after scheduling, Admin's cancel is ALSO refused (contact-block applies to cancel too, same as update) and Sales Rep is refused ('Lead not found') — the row stays PENDING", async ({
    page,
  }) => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { email: ADMIN_EMAIL } });
    const lead = await prisma.lead.create({
      data: {
        firstName: "PreQuarantine",
        lastName: `Cancel-${RUN_ID}`,
        email: `prequarantine-cancel-${RUN_ID}@example.com`,
        phone: "9495550098",
        source: "WEBSITE_FORM",
      },
    });
    createdIds.push(lead.id);
    const uniqueBody = `Cancel-test body ${RUN_ID}`;
    const msg = await prisma.scheduledMessage.create({
      data: {
        leadId: lead.id,
        channel: "SMS",
        body: uniqueBody,
        sendAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "PENDING",
        createdById: adminUser.id,
      },
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { quarantined: true } });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/scheduled");
    const row = page.locator("div.rounded-lg.border.border-neutral-200.bg-white.p-4", { hasText: uniqueBody });
    page.once("dialog", (d) => d.accept()); // cancel() does a native confirm() first
    const captured = await captureAction(page, async () => {
      await row.locator('button:has-text("Cancel")').click();
    });
    await expect(row.locator("text=held in Thumbtack quarantine")).toBeVisible();
    const afterAdmin = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(afterAdmin.status, "Admin's own refused cancel left the row PENDING").toBe("PENDING");
    await logout(page);

    await loginAs(page, salesRepEmail, PASSWORD);
    const replayRes = await replayAction(page, "/scheduled", captured);
    expect(replayRes.status()).toBeLessThan(300);
    const replayBody = await replayRes.text();
    expect(replayBody).toContain("Lead not found");
    const afterReplay = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(afterReplay.status, "Sales Rep replay left the row PENDING too").toBe("PENDING");
    await logout(page);
  });
});
