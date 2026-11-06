import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { getLeadFunnelBySource } from "../src/lib/leads";
import { loadSalesDashboard } from "../src/lib/salesDashboard";

// Item 1: a new "Unable to Contact" lead stage — a deliberate pause, not an
// outcome. A lead moved here comes off the active pipeline board and its
// callback reminders stop (same ARCHIVED_LEAD_STAGES treatment as Lost),
// but it's never counted as Won or Lost, its full record (notes/
// communications/stage history) stays intact, and a one-click reopen always
// lands back on CONTACTED.
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
    clientName: `UTC Quote ${id}`,
    id,
    phone: "9495559900",
    clientEmail: `${id}@example.com`,
    service: "standard",
    frequency: "One-Time",
    low: "250",
    high: "300",
    suggested: "275",
    savedAt: new Date().toISOString(),
    status: "pending",
    sentAt: null,
    // nextStep/followUpDate deliberately left unset, same as a freshly
    // auto-created draft quote — this is what puts it in the quotes page's
    // needs-scheduling list in the first place.
  };
}

interface Fixture {
  leadId: string;
  quoteId: string;
  quoteKey: string;
  leadName: string;
  followUpDueAt: Date;
}

async function createFixture(label: string): Promise<Fixture> {
  const quoteId = `utc-${label}-${RUN_ID}`;
  await prisma.salesToolData.create({
    data: { key: `quote:${quoteId}`, value: JSON.stringify(makeQuote(quoteId)) },
  });

  const firstName = `UTCLife${label}${RUN_ID}`;
  const lastName = "Lead";
  // Clearly overdue (several days back), regardless of business-day
  // boundaries or what instant "now" happens to be.
  const followUpDueAt = daysFromNow(-3);

  const lead = await prisma.lead.create({
    data: {
      firstName,
      lastName,
      email: `utc-lead-${label}-${RUN_ID}@example.com`,
      phone: "9495551111",
      source: "WEBSITE_FORM",
      stage: "CONTACTED",
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

  return { leadId: lead.id, quoteId, quoteKey: `quote:${quoteId}`, leadName: `${firstName} ${lastName}`, followUpDueAt };
}

async function cleanupFixture(f: Fixture) {
  await prisma.leadCommunication.deleteMany({ where: { leadId: f.leadId } });
  await prisma.leadNote.deleteMany({ where: { leadId: f.leadId } });
  await prisma.leadStageChange.deleteMany({ where: { leadId: f.leadId } });
  await prisma.lead.deleteMany({ where: { id: f.leadId } });
  await prisma.salesToolData.deleteMany({ where: { key: f.quoteKey } });
}

// Shared core assertions for both the Sales Rep and the Admin/owner runs —
// `actorPage` is logged in as whichever role is performing the move, while
// `homePage` (logged in as Admin) is used for the one check (Home's
// Follow-Ups Due card) a Sales Rep account can never reach directly, since
// /sales/leads redirects a Sales Rep away from Home entirely — mirroring the
// same convention already used in followup-sales-home-consistency.spec.ts.
async function runLifecycle(
  actorPage: Page,
  homePage: Page,
  f: Fixture,
  expectSalesRepLists: boolean
) {
  const dashBefore = await loadSalesDashboard(true);

  // --- 1. Move to Unable to Contact ---
  await actorPage.goto(`/sales/leads/${f.leadId}`);
  await actorPage.getByRole("button", { name: "Move to: Unable to Contact" }).click();

  await expect
    .poll(async () => (await prisma.lead.findUniqueOrThrow({ where: { id: f.leadId } })).stage, {
      timeout: 10_000,
    })
    .toBe("UNABLE_TO_CONTACT");

  // --- 2. Nowhere on /sales/leads ---
  await actorPage.goto("/sales/leads");
  await expect(actorPage.getByText(f.leadName, { exact: false })).toHaveCount(0);
  if (expectSalesRepLists) {
    // Sales Rep's page also renders Callbacks / Needs Follow-up Date / the
    // plain Leads table on this same page — the whole-page check above
    // already covers all three, but assert the section headings are still
    // there (i.e. we're checking the right page) for a meaningful negative.
    await expect(actorPage.getByRole("heading", { name: "Callbacks", exact: true })).toBeVisible();
    await expect(actorPage.getByRole("heading", { name: "Needs Follow-up Date", exact: true })).toBeVisible();
    await expect(actorPage.getByRole("heading", { name: "Leads", exact: true })).toBeVisible();
  } else {
    await expect(actorPage.getByRole("heading", { name: "Lead Pipeline" })).toBeVisible();
  }

  // --- 3. No longer on Home's Follow-Ups Due card ---
  await homePage.goto("/");
  const followUpsBlock = homePage.getByText("Follow-Ups Due", { exact: true }).locator("xpath=..");
  await expect(followUpsBlock.getByText(f.leadName, { exact: false })).toHaveCount(0);

  // --- 4. Linked quote no longer in /sales/quotes needs-scheduling list ---
  await actorPage.goto("/sales/quotes");
  const aidBanner = actorPage.getByText(/need.*a next step scheduled/i).locator("xpath=..");
  if (await aidBanner.count()) {
    await expect(aidBanner.getByText(f.quoteId, { exact: false })).toHaveCount(0);
  }

  // --- 5. loadSalesDashboard()'s wonCount/lostCount unchanged ---
  const dashAfter = await loadSalesDashboard(true);
  expect(dashAfter.wonCount).toBe(dashBefore.wonCount);
  expect(dashAfter.lostCount).toBe(dashBefore.lostCount);

  // --- 6. Full history still readable from the lead's own detail page ---
  await actorPage.goto(`/sales/leads/${f.leadId}`);
  await expect(actorPage.getByText("Seed note for", { exact: false })).toBeVisible();
  await expect(actorPage.getByText("Reaching out", { exact: false }).first()).toBeVisible();
  const leadRow = await prisma.lead.findUniqueOrThrow({ where: { id: f.leadId } });
  expect(leadRow.firstName).toContain("UTCLife");

  // --- 7. Appears on the new Unable-to-Contact list page ---
  await actorPage.goto("/sales/leads/unable-to-contact");
  await expect(actorPage.getByText(f.leadName, { exact: false })).toBeVisible();

  // --- 8. Reopen via the one-click action ---
  await actorPage.goto(`/sales/leads/${f.leadId}`);
  await actorPage.getByRole("button", { name: "Move to: Contacted" }).click();

  await expect
    .poll(async () => (await prisma.lead.findUniqueOrThrow({ where: { id: f.leadId } })).stage, {
      timeout: 10_000,
    })
    .toBe("CONTACTED");

  const reopened = await prisma.lead.findUniqueOrThrow({ where: { id: f.leadId } });
  expect(reopened.followUpDueAt).not.toBeNull();
  expect(reopened.followUpDueAt!.getTime()).toBe(f.followUpDueAt.getTime());

  await actorPage.goto("/sales/leads");
  await expect(actorPage.getByText(f.leadName, { exact: false }).first()).toBeVisible();
  if (expectSalesRepLists) {
    const callbacksBlock = actorPage.getByText("Callbacks", { exact: true }).locator("xpath=..");
    await expect(callbacksBlock.getByText(f.leadName, { exact: false })).toBeVisible();
  }

  await homePage.goto("/");
  const followUpsBlockAfter = homePage.getByText("Follow-Ups Due", { exact: true }).locator("xpath=..");
  await expect(followUpsBlockAfter.getByText(f.leadName, { exact: false })).toBeVisible();

  await actorPage.goto("/sales/quotes");
  const aidBannerAfter = actorPage.getByText(/need.*a next step scheduled/i).locator("xpath=..");
  await expect(aidBannerAfter.getByText(f.quoteId, { exact: false })).toBeVisible();

  // No longer on the Unable-to-Contact list.
  await actorPage.goto("/sales/leads/unable-to-contact");
  await expect(actorPage.getByText(f.leadName, { exact: false })).toHaveCount(0);
}

test.describe.serial("Unable to Contact lead lifecycle — Sales Rep", () => {
  const SALES_REP_EMAIL = `utc-salesrep-${RUN_ID}@example.com`;
  const SALES_REP_PASSWORD = "Test-Password-123!";
  let salesRepId: string;
  let fixture: Fixture;

  test.beforeAll(async () => {
    const salesRep = await prisma.user.create({
      data: {
        email: SALES_REP_EMAIL,
        name: `UTC Sales Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(SALES_REP_PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = salesRep.id;
    fixture = await createFixture("salesrep");
  });

  test.afterAll(async () => {
    await cleanupFixture(fixture);
    await prisma.departmentAccess.deleteMany({ where: { userId: salesRepId } });
    await prisma.user.deleteMany({ where: { id: salesRepId } });
  });

  test("full lifecycle: pause, verify everywhere it's hidden/kept, then reopen", async ({ browser }) => {
    const salesRepContext = await browser.newContext();
    const homeContext = await browser.newContext();
    const salesRepPage = await salesRepContext.newPage();
    const homePage = await homeContext.newPage();

    await loginAs(salesRepPage, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await loginAs(homePage, ADMIN_EMAIL, ADMIN_PASSWORD);

    await runLifecycle(salesRepPage, homePage, fixture, true);

    await salesRepContext.close();
    await homeContext.close();
  });
});

test.describe.serial("Unable to Contact lead lifecycle — Admin (owner)", () => {
  let fixture: Fixture;

  test.beforeAll(async () => {
    fixture = await createFixture("admin");
  });

  test.afterAll(async () => {
    await cleanupFixture(fixture);
  });

  test("full lifecycle: pause, verify everywhere it's hidden/kept, then reopen — same behavior as Sales Rep", async ({
    browser,
  }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAs(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Admin's own /sales/leads view is the Lead Pipeline board only (no
    // Callbacks/Needs-Follow-up-Date/plain Leads sections — those are the
    // Sales Rep's own page shape), so expectSalesRepLists is false here.
    await runLifecycle(adminPage, adminPage, fixture, false);

    await adminContext.close();
  });
});

// Item 10: a forged/direct call to either new action by an Office Assistant
// — even one with full SALES_LEADS edit access — must be refused. Real
// server actions can't be meaningfully imported and called outside a Next.js
// request (getSession() needs next/headers' request-scoped cookies()), and
// the Office Assistant's own lead-detail UI never renders these buttons at
// all, so this reproduces an actual forged call at the wire level: capture
// the exact POST a legitimate click makes (intercepted and aborted before it
// reaches the server, so it never actually executes), then replay that exact
// request — same Next-Action id, same body — under the Office Assistant's
// own authenticated session instead.
async function captureServerActionRequest(
  page: Page,
  url: string,
  trigger: () => Promise<void>
): Promise<{ url: string; headers: Record<string, string>; postData: string | null }> {
  let captured: { url: string; headers: Record<string, string>; postData: string | null } | null = null;
  await page.route(url, async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      captured = { url: req.url(), headers: req.headers(), postData: req.postData() };
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await trigger();
  await page.waitForTimeout(1000);
  await page.unroute(url);
  if (!captured) throw new Error(`Never captured a server action POST to ${url}`);
  return captured;
}

async function replayAsForgedRequest(
  context: BrowserContext,
  captured: { url: string; headers: Record<string, string>; postData: string | null }
) {
  const headers = { ...captured.headers };
  delete headers["cookie"];
  delete headers["host"];
  delete headers["content-length"];
  return context.request.post(captured.url, { headers, data: captured.postData ?? undefined });
}

test.describe("Unable to Contact actions refuse a forged Office Assistant call", () => {
  const OA_EMAIL = `utc-oa-forge-${RUN_ID}@example.com`;
  const OA_PASSWORD = "Test-Password-123!";
  let oaId: string;
  let contactedLeadId: string;
  let unableLeadId: string;

  test.beforeAll(async () => {
    const oa = await prisma.user.create({
      data: {
        email: OA_EMAIL,
        name: `UTC Forge OA ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(OA_PASSWORD),
        mustSetPassword: false,
        active: true,
        // Full SALES_LEADS (and Callback Queue) EDIT access — the forged
        // call must still be refused despite this, since it's gated on role
        // (requireDepartmentAccess("SALES")), not on this narrower grant.
        areaAccess: {
          create: [
            { area: "SALES_LEADS", canEdit: true },
            { area: "CALLBACK_QUEUE", canEdit: true },
          ],
        },
      },
    });
    oaId = oa.id;

    const contacted = await prisma.lead.create({
      data: {
        firstName: `UTCForgeContacted${RUN_ID}`,
        lastName: "Lead",
        email: `utc-forge-contacted-${RUN_ID}@example.com`,
        phone: "9495552222",
        source: "WEBSITE_FORM",
        stage: "CONTACTED",
      },
    });
    contactedLeadId = contacted.id;

    const unable = await prisma.lead.create({
      data: {
        firstName: `UTCForgeUnable${RUN_ID}`,
        lastName: "Lead",
        email: `utc-forge-unable-${RUN_ID}@example.com`,
        phone: "9495552223",
        source: "WEBSITE_FORM",
        stage: "UNABLE_TO_CONTACT",
      },
    });
    unableLeadId = unable.id;
  });

  test.afterAll(async () => {
    await prisma.leadStageChange.deleteMany({ where: { leadId: { in: [contactedLeadId, unableLeadId] } } });
    await prisma.lead.deleteMany({ where: { id: { in: [contactedLeadId, unableLeadId] } } });
    await prisma.areaAccess.deleteMany({ where: { userId: oaId } });
    await prisma.user.deleteMany({ where: { id: oaId } });
  });

  test("markLeadUnableToContactAction: forged call from an Office Assistant never changes the lead", async ({
    browser,
  }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAs(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminPage.goto(`/sales/leads/${contactedLeadId}`);

    const captured = await captureServerActionRequest(
      adminPage,
      `**/sales/leads/${contactedLeadId}`,
      async () => {
        await adminPage.getByRole("button", { name: "Move to: Unable to Contact" }).click().catch(() => {});
      }
    );

    const before = await prisma.lead.findUniqueOrThrow({ where: { id: contactedLeadId } });
    expect(before.stage).toBe("CONTACTED"); // the aborted admin click never reached the server

    const oaContext = await browser.newContext();
    const oaPage = await oaContext.newPage();
    await loginAs(oaPage, OA_EMAIL, OA_PASSWORD);

    const response = await replayAsForgedRequest(oaContext, captured);
    expect(response.status()).toBeLessThan(500);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: contactedLeadId } });
    expect(after.stage).toBe("CONTACTED"); // refused — never moved

    await adminContext.close();
    await oaContext.close();
  });

  test("reopenLeadFromUnableToContactAction: forged call from an Office Assistant never changes the lead", async ({
    browser,
  }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAs(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminPage.goto(`/sales/leads/${unableLeadId}`);

    const captured = await captureServerActionRequest(
      adminPage,
      `**/sales/leads/${unableLeadId}`,
      async () => {
        await adminPage.getByRole("button", { name: "Move to: Contacted" }).click().catch(() => {});
      }
    );

    const before = await prisma.lead.findUniqueOrThrow({ where: { id: unableLeadId } });
    expect(before.stage).toBe("UNABLE_TO_CONTACT");

    const oaContext = await browser.newContext();
    const oaPage = await oaContext.newPage();
    await loginAs(oaPage, OA_EMAIL, OA_PASSWORD);

    const response = await replayAsForgedRequest(oaContext, captured);
    expect(response.status()).toBeLessThan(500);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: unableLeadId } });
    expect(after.stage).toBe("UNABLE_TO_CONTACT"); // refused — never reopened

    await adminContext.close();
    await oaContext.close();
  });
});

// Item 11: getLeadFunnelBySource's new unableToContact bucket — total stays
// fully inclusive, open excludes Unable-to-Contact, won/lost unaffected.
test.describe("getLeadFunnelBySource counts Unable to Contact separately", () => {
  const leadIds: string[] = [];

  test.afterAll(async () => {
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  });

  test("total is inclusive; open excludes Unable to Contact; won/lost unaffected", async () => {
    const source = "REFERRAL" as const;
    const before = await getLeadFunnelBySource();
    const beforeEntry = before.find((s) => s.source === source) ?? {
      total: 0,
      open: 0,
      won: 0,
      lost: 0,
      unableToContact: 0,
    };

    const makeLead = (stage: "NEW_INQUIRY" | "WON" | "LOST" | "UNABLE_TO_CONTACT", label: string) =>
      prisma.lead.create({
        data: {
          firstName: `Funnel${label}${RUN_ID}`,
          lastName: "Lead",
          email: `funnel-${label}-${RUN_ID}@example.com`,
          phone: "9495553333",
          source,
          stage,
        },
      });

    const [open, won, lost, unable] = await Promise.all([
      makeLead("NEW_INQUIRY", "open"),
      makeLead("WON", "won"),
      makeLead("LOST", "lost"),
      makeLead("UNABLE_TO_CONTACT", "unable"),
    ]);
    leadIds.push(open.id, won.id, lost.id, unable.id);

    const after = await getLeadFunnelBySource();
    const afterEntry = after.find((s) => s.source === source)!;
    expect(afterEntry).toBeTruthy();

    // Total is inclusive of every lead, regardless of stage.
    expect(afterEntry.total).toBe(beforeEntry.total + 4);
    // Open only picked up the one genuinely-open (NEW_INQUIRY) lead.
    expect(afterEntry.open).toBe(beforeEntry.open + 1);
    expect(afterEntry.won).toBe(beforeEntry.won + 1);
    expect(afterEntry.lost).toBe(beforeEntry.lost + 1);
    // Unable to Contact got its own bucket, not lumped into open.
    expect(afterEntry.unableToContact).toBe(beforeEntry.unableToContact + 1);
  });
});
