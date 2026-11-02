import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Item 2: a repeat inquiry from an Unable-to-Contact lead must reopen that
// existing lead (back onto the active pipeline, stage -> CONTACTED) instead
// of creating a duplicate Lead row. The existing lead's quoteKey, seed
// notes/communications, and followUpDueAt are left exactly as they were —
// only the stage changes, which is what restores its normal follow-up/
// needs-scheduling visibility. No automatic client message or internal
// "new lead" alert fires for a reopen (notifyNewLead/
// maybeSendAfterHoursAutoReply are only reached on the brand-new-lead path).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function makeQuote(id: string) {
  return {
    clientName: `Reopen Quote ${id}`,
    id,
    phone: "9495559901",
    clientEmail: `${id}@example.com`,
    service: "standard",
    frequency: "One-Time",
    low: "250",
    high: "300",
    suggested: "275",
    savedAt: new Date().toISOString(),
    status: "pending",
    sentAt: null,
    // nextStep/followUpDate deliberately left unset — what puts it in the
    // quotes page's needs-scheduling list in the first place.
  };
}

interface Fixture {
  leadId: string;
  email: string;
  quoteId: string;
  quoteKey: string;
  leadName: string;
  followUpDueAt: Date;
}

async function createFixture(label: string): Promise<Fixture> {
  const quoteId = `reopen-${label}-${RUN_ID}`;
  await prisma.salesToolData.create({
    data: { key: `quote:${quoteId}`, value: JSON.stringify(makeQuote(quoteId)) },
  });

  const firstName = `ReopenLife${label}${RUN_ID}`;
  const lastName = "Lead";
  const email = `reopen-lead-${label}-${RUN_ID}@example.com`;
  // Clearly overdue (several days back), regardless of business-day
  // boundaries or what instant "now" happens to be.
  const followUpDueAt = daysFromNow(-3);

  const lead = await prisma.lead.create({
    data: {
      firstName,
      lastName,
      email,
      phone: "9495551112",
      source: "WEBSITE_FORM",
      stage: "UNABLE_TO_CONTACT",
      followUpDueAt,
      quoteKey: quoteId,
    },
  });

  await prisma.leadNote.create({
    data: { leadId: lead.id, body: `Seed note for ${label} fixture — proves history survives.` },
  });
  await prisma.leadCommunication.create({
    data: {
      leadId: lead.id,
      channel: "EMAIL",
      direction: "OUTBOUND",
      subject: "Reaching out",
      body: "Hi, following up on your inquiry.",
      status: "SENT",
    },
  });

  return { leadId: lead.id, email, quoteId, quoteKey: `quote:${quoteId}`, leadName: `${firstName} ${lastName}`, followUpDueAt };
}

async function cleanupFixture(f: Fixture) {
  // Lead, LeadNote, LeadStageChange and LeadCommunication all cascade off
  // Lead's own delete — only the separate SalesToolData quote row needs its
  // own cleanup.
  await prisma.lead.deleteMany({ where: { id: f.leadId } });
  await prisma.salesToolData.deleteMany({ where: { key: f.quoteKey } });
}

async function fillAndSubmitLeadForm(
  page: Page,
  opts: { email: string; message?: string; serviceKey?: string }
) {
  await page.goto("/lead-form");
  await page.fill('input[name="firstName"]', "Repeat");
  await page.fill('input[name="lastName"]', "Inquiry");
  await page.fill('input[name="email"]', opts.email);
  await page.fill('input[name="phone"]', "9495557777");
  await page.selectOption('select[name="serviceInterest"]', opts.serviceKey ?? "deep");
  await page.fill('input[name="squareFootage"]', "2000");
  await page.selectOption('select[name="frequency"]', "weekly");
  await page.selectOption('select[name="howHeard"]', "REFERRAL");
  if (opts.message) {
    await page.fill('textarea[name="message"]', opts.message);
  }
  await page.click('button[type="submit"]');
  await page.waitForURL("**/lead-form/thank-you");
}

test.describe.serial("Lead form resubmission reopens an Unable to Contact lead", () => {
  let fixture: Fixture;

  test.beforeAll(async () => {
    fixture = await createFixture("reopen");
  });

  test.afterAll(async () => {
    await cleanupFixture(fixture);
  });

  test("resubmitting reopens the existing lead instead of creating a duplicate", async ({ page, browser }) => {
    const commCountBefore = await prisma.leadCommunication.count({ where: { leadId: fixture.leadId } });
    const quoteCountBefore = await prisma.salesToolData.count({ where: { key: fixture.quoteKey } });

    const resubmissionMessage = "Calling again — hoping to get scheduled this time, please call me back.";
    await fillAndSubmitLeadForm(page, { email: fixture.email, message: resubmissionMessage, serviceKey: "deep" });

    // --- Exactly one Lead row for this email, now reopened to CONTACTED ---
    const leads = await prisma.lead.findMany({
      where: { email: { equals: fixture.email, mode: "insensitive" } },
    });
    expect(leads.length).toBe(1);
    expect(leads[0].id).toBe(fixture.leadId);
    expect(leads[0].stage).toBe("CONTACTED");
    // quoteKey untouched — still points at the same pre-existing quote.
    expect(leads[0].quoteKey).toBe(fixture.quoteId);

    // --- A LeadStageChange row records the reopen ---
    const stageChange = await prisma.leadStageChange.findFirst({
      where: { leadId: fixture.leadId, fromStage: "UNABLE_TO_CONTACT", toStage: "CONTACTED" },
      orderBy: { createdAt: "desc" },
    });
    expect(stageChange).not.toBeNull();
    expect(stageChange!.changedById).toBeNull();

    // --- A new LeadNote records the resubmission; seed note untouched ---
    const notes = await prisma.leadNote.findMany({
      where: { leadId: fixture.leadId },
      orderBy: { createdAt: "asc" },
    });
    expect(notes.some((n) => n.body.startsWith(`Seed note for reopen fixture`))).toBe(true);
    const newNote = notes.find((n) => n.body.includes("reopened"));
    expect(newNote).toBeTruthy();
    expect(newNote!.authorId).toBeNull();
    expect(newNote!.body).toContain(resubmissionMessage);
    expect(newNote!.body).toContain("Top to Bottom Deep Clean");

    // --- Seed LeadCommunication still present; no new one was created ---
    const commCountAfter = await prisma.leadCommunication.count({ where: { leadId: fixture.leadId } });
    expect(commCountAfter).toBe(commCountBefore);
    const seedComm = await prisma.leadCommunication.findFirst({ where: { leadId: fixture.leadId } });
    expect(seedComm?.subject).toBe("Reaching out");

    // --- No duplicate quote was created ---
    const quoteCountAfter = await prisma.salesToolData.count({ where: { key: fixture.quoteKey } });
    expect(quoteCountAfter).toBe(quoteCountBefore);

    // --- followUpDueAt survived the round trip unchanged ---
    expect(leads[0].followUpDueAt).not.toBeNull();
    expect(leads[0].followUpDueAt!.getTime()).toBe(fixture.followUpDueAt.getTime());

    // --- Reappears in the pipeline, Home's Follow-Ups Due card, and the
    // quotes needs-scheduling list — all falling out of the stage change
    // alone, same as the existing reopenLeadFromUnableToContactAction. ---
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAs(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);

    await adminPage.goto("/sales/leads");
    await expect(adminPage.getByText(fixture.leadName, { exact: false }).first()).toBeVisible();

    await adminPage.goto("/");
    const followUpsBlock = adminPage.getByText("Follow-Ups Due", { exact: true }).locator("xpath=..");
    await expect(followUpsBlock.getByText(fixture.leadName, { exact: false })).toBeVisible();

    await adminPage.goto("/sales/quotes");
    const aidBanner = adminPage.getByText(/need.*a next step scheduled/i).locator("xpath=..");
    await expect(aidBanner.getByText(fixture.quoteId, { exact: false })).toBeVisible();

    await adminContext.close();
  });
});

test.describe("Regression: lead-form resubmission behavior for other stages is unchanged", () => {
  const leadIds: string[] = [];

  test.afterAll(async () => {
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  });

  test("resubmitting with an email matching a WON lead still creates a brand-new second Lead", async ({ page }) => {
    const email = `reopen-regression-won-${RUN_ID}@example.com`;
    const wonLead = await prisma.lead.create({
      data: {
        firstName: `RegressionWon${RUN_ID}`,
        lastName: "Lead",
        email,
        phone: "9495558888",
        source: "WEBSITE_FORM",
        stage: "WON",
      },
    });
    leadIds.push(wonLead.id);

    await fillAndSubmitLeadForm(page, { email });

    const leads = await prisma.lead.findMany({ where: { email: { equals: email, mode: "insensitive" } } });
    expect(leads.length).toBe(2);
    leadIds.push(...leads.filter((l) => l.id !== wonLead.id).map((l) => l.id));

    // The original WON lead is completely untouched.
    const wonAfter = await prisma.lead.findUniqueOrThrow({ where: { id: wonLead.id } });
    expect(wonAfter.stage).toBe("WON");

    // The new lead starts fresh at the default stage, not CONTACTED.
    const newLead = leads.find((l) => l.id !== wonLead.id)!;
    expect(newLead.stage).toBe("NEW_INQUIRY");
  });

  test("resubmitting with an email matching a LOST lead still creates a brand-new second Lead", async ({ page }) => {
    const email = `reopen-regression-lost-${RUN_ID}@example.com`;
    const lostLead = await prisma.lead.create({
      data: {
        firstName: `RegressionLost${RUN_ID}`,
        lastName: "Lead",
        email,
        phone: "9495558889",
        source: "WEBSITE_FORM",
        stage: "LOST",
      },
    });
    leadIds.push(lostLead.id);

    await fillAndSubmitLeadForm(page, { email });

    const leads = await prisma.lead.findMany({ where: { email: { equals: email, mode: "insensitive" } } });
    expect(leads.length).toBe(2);
    leadIds.push(...leads.filter((l) => l.id !== lostLead.id).map((l) => l.id));

    const lostAfter = await prisma.lead.findUniqueOrThrow({ where: { id: lostLead.id } });
    expect(lostAfter.stage).toBe("LOST");

    const newLead = leads.find((l) => l.id !== lostLead.id)!;
    expect(newLead.stage).toBe("NEW_INQUIRY");
  });
});
