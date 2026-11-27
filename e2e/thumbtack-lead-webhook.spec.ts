import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  parseThumbtackLeadBody,
  getThumbtackEventType,
  ingestThumbtackLead,
  markThumbtackLeadAsTest,
  releaseThumbtackLeadToPipeline,
  THUMBTACK_SECRET_HEADER,
} from "../src/lib/thumbtackLeads";
import { loadLeadKpis, getLeadFunnelBySource, getLostLeads, buildLeadExportCsv } from "../src/lib/leads";
import { maybeSendAfterHoursAutoReply } from "../src/lib/leadAutoReply";
import type { sendEmail } from "../src/lib/email";

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

// A sample Thumbtack "Lead" event — see src/lib/thumbtackLeads.ts's own
// file-header comment: the exact top-level shape (fields directly on the
// body, no wrapper key) and event-type field are assumptions, not confirmed
// against a captured real delivery.
function sampleLeadBody(overrides: Record<string, unknown> = {}) {
  return {
    negotiationID: `negotiation-${RUN_ID}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    customer: { firstName: "Pat", lastName: "Customer", phone: `949555${Math.floor(1000 + Math.random() * 8999)}` },
    request: {
      requestID: `request-${RUN_ID}`,
      description: "Need a deep clean before move-in",
      category: { name: "House Cleaning" },
      location: { address1: "123 Main St", city: "Irvine", state: "CA", zipCode: "92618" },
      details: [{ question: "How many bedrooms?", answer: "3" }],
      proposedTimes: [],
    },
    leadPrice: 24.5,
    requestReviewLink: "https://www.thumbtack.com/some-request",
    ...overrides,
  };
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
    expect(parsed!.leadPrice).toBe(24.5);
    expect(parsed!.requestReviewLink).toBe("https://www.thumbtack.com/some-request");
  });

  test("a digits-only phone in any format is normalized; parsing fails without a negotiationID", () => {
    const parsed = parseThumbtackLeadBody(
      sampleLeadBody({ customer: { firstName: "Pat", lastName: "Customer", phone: "(949) 555-1212" } })
    );
    expect(parsed!.phone).toBe("9495551212");

    expect(parseThumbtackLeadBody(sampleLeadBody({ negotiationID: "" }))).toBeNull();
    expect(parseThumbtackLeadBody(sampleLeadBody({ negotiationID: undefined }))).toBeNull();
  });

  test("a Lead-shaped body is recognized structurally; a Message-shaped body (no request/leadPrice) is not", () => {
    expect(getThumbtackEventType(sampleLeadBody())).toBe("LEAD");

    // Message events show the customer as "Unknown" and carry no
    // request/leadPrice at all (per the brief) — never classified as LEAD.
    const messageBody = {
      negotiationID: `negotiation-${RUN_ID}-msg`,
      customer: { firstName: "Unknown", lastName: "Unknown" },
      message: { text: "Hi, are you available Tuesday?" },
    };
    expect(getThumbtackEventType(messageBody)).not.toBe("LEAD");
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

  test("a Message event (no request/leadPrice) creates nothing and still returns 2xx", async ({ request }) => {
    const negotiationID = `negotiation-${RUN_ID}-message-event`;
    const res = await request.post(WEBHOOK_URL, {
      headers: { [THUMBTACK_SECRET_HEADER]: WEBHOOK_SECRET },
      data: {
        negotiationID,
        customer: { firstName: "Unknown", lastName: "Unknown" },
        message: { text: "What time works for you?" },
      },
    });
    expect(res.status()).toBe(200);
    expect(await prisma.lead.count({ where: { externalId: negotiationID } })).toBe(0);
  });

  test("a Lead-typed event that can't actually be saved (no negotiationID) returns a non-2xx", async ({ request }) => {
    const res = await request.post(WEBHOOK_URL, {
      headers: { [THUMBTACK_SECRET_HEADER]: WEBHOOK_SECRET },
      data: { eventType: "lead", request: { requestID: "x" }, leadPrice: 10 }, // no negotiationID at all
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe.serial("Thumbtack webhook: quarantine visibility and admin-only actions (browser)", () => {
  let originalQuarantineFlag: string | undefined;
  const createdIds: string[] = [];
  let salesRepId: string;
  const salesRepEmail = `thumbtack-salesrep-${RUN_ID}@example.com`;

  test.beforeAll(async () => {
    originalQuarantineFlag = process.env.THUMBTACK_QUARANTINE_ENABLED;
    const { hashPassword } = await import("../src/lib/password");
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
  });

  test.afterAll(async () => {
    if (originalQuarantineFlag === undefined) delete process.env.THUMBTACK_QUARANTINE_ENABLED;
    else process.env.THUMBTACK_QUARANTINE_ENABLED = originalQuarantineFlag;
    for (const id of createdIds) await cleanupLead(id);
    await prisma.user.delete({ where: { id: salesRepId } }).catch(() => {});
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
});
