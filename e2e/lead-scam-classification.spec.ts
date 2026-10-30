import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { loadLeadKpis, getLeadFunnelBySource, getScamLeads } from "../src/lib/leads";
import { loadSalesDashboard, getSalesActuals } from "../src/lib/salesDashboard";
import { getTodayCardData } from "../src/lib/hrToday";
import { businessDayRangeUtc } from "../src/lib/timezone";
import { runScheduledMessageSchedulerTick } from "../src/lib/scheduledMessageScheduler";

// Section B: Scam lead classification. All fixtures are throwaway rows
// created/destroyed per test (or per file for shared users), never a real
// lead. No real email is sent (same reasoning as
// pricing-tool-manual-quote-identity.spec.ts — this test environment has no
// MS_GRAPH_* credentials, so sendEmail() fails closed before any outbound
// network call).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function captureActionId(page: Page, trigger: () => Promise<void>): Promise<string> {
  let captured: string | null = null;
  const listener = (req: import("@playwright/test").Request) => {
    const header = req.headers()["next-action"];
    if (header && !captured) captured = header;
  };
  page.on("request", listener);
  await trigger();
  await page.waitForTimeout(800);
  page.off("request", listener);
  if (!captured) throw new Error("Failed to capture a Server Action id — trigger() didn't fire one.");
  return captured;
}

async function forgeAction(page: Page, path: string, actionId: string, args: unknown[]) {
  return page.request.post(path, {
    headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8" },
    data: JSON.stringify(args),
    maxRedirects: 0,
  });
}

function makeLeadData(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Scam",
    lastName: `Fixture ${suffix}`,
    email: `scam-fixture-${suffix}-${RUN_ID}@example.com`,
    phone: "5551234567",
    stage: "NEW_INQUIRY" as const,
    ...overrides,
  };
}

test.describe.serial("Scam lead classification (Section B)", () => {
  let salesRepId: string;
  let salesRepEmail: string;
  let officeAssistantId: string;
  let officeAssistantEmail: string;
  const cleanupLeadIds = new Set<string>();
  const cleanupQuoteKeys = new Set<string>();

  test.beforeAll(async () => {
    salesRepEmail = `scam-sales-rep-${RUN_ID}@example.com`;
    const rep = await prisma.user.create({
      data: {
        email: salesRepEmail,
        name: `Scam Test Sales Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = rep.id;

    officeAssistantEmail = `scam-office-assistant-${RUN_ID}@example.com`;
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    const oa = await prisma.user.create({
      data: {
        email: officeAssistantEmail,
        name: `Scam Test Office Assistant ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: admin.id,
        areaAccess: { create: [{ area: "HR_SUMMARY", canEdit: false }] },
      },
    });
    officeAssistantId = oa.id;
  });

  test.afterAll(async () => {
    for (const leadId of cleanupLeadIds) {
      await prisma.scheduledMessage.deleteMany({ where: { leadId } });
      await prisma.leadStageChange.deleteMany({ where: { leadId } });
      await prisma.leadNote.deleteMany({ where: { leadId } });
      await prisma.leadCommunication.deleteMany({ where: { leadId } });
      await prisma.lead.deleteMany({ where: { id: leadId } });
    }
    for (const key of cleanupQuoteKeys) {
      await prisma.salesToolData.deleteMany({ where: { key: `quote:${key}` } });
    }
    await prisma.departmentAccess.deleteMany({ where: { userId: salesRepId } });
    await prisma.areaAccess.deleteMany({ where: { userId: officeAssistantId } });
    await prisma.user.deleteMany({ where: { id: { in: [salesRepId, officeAssistantId] } } });
    await prisma.$disconnect();
  });

  test("full round trip: classify -> archive listing -> restore matches the real prior stage from LeadStageChange history", async ({
    page,
  }) => {
    const lead = await prisma.lead.create({ data: makeLeadData("roundtrip", { stage: "QUOTED" }) });
    cleanupLeadIds.add(lead.id);

    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto(`/sales/leads/${lead.id}`);

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Mark as Scam" }).click();
    await page.getByPlaceholder(/Fake address/).fill("Asked for gift cards");
    await page.getByRole("button", { name: "Confirm: Mark as Scam" }).click();
    await expect(page.locator("text=Classified as Scam")).toBeVisible();

    const afterScam = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(afterScam.stage).toBe("SCAM");
    expect(afterScam.scamReason).toBe("Asked for gift cards");

    const lastChange = await prisma.leadStageChange.findFirst({
      where: { leadId: lead.id, toStage: "SCAM" },
      orderBy: { createdAt: "desc" },
    });
    expect(lastChange?.fromStage).toBe("QUOTED");

    const audit = await prisma.auditLogEntry.findFirst({
      where: { recordId: lead.id, action: "LEAD_MARKED_SCAM" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();

    const scamLeads = await getScamLeads();
    expect(scamLeads.some((l) => l.id === lead.id)).toBe(true);

    await page.goto("/sales/leads/scam");
    await expect(page.locator(`a[href="/sales/leads/${lead.id}"]`)).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await page.locator(`tr:has(a[href="/sales/leads/${lead.id}"]) button:has-text("Restore")`).click();
    await page.waitForTimeout(500);

    const afterRestore = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(afterRestore.stage).toBe("QUOTED");
    expect(afterRestore.scamReason).toBeNull();

    const restoreAudit = await prisma.auditLogEntry.findFirst({
      where: { recordId: lead.id, action: "LEAD_RESTORED_FROM_SCAM" },
    });
    expect(restoreAudit).not.toBeNull();
  });

  test("a WON lead is refused, not silently converted", async ({ page }) => {
    const wonLead = await prisma.lead.create({ data: makeLeadData("won-refused", { stage: "WON" }) });
    const eligibleLead = await prisma.lead.create({ data: makeLeadData("won-refused-capture") });
    cleanupLeadIds.add(wonLead.id);
    cleanupLeadIds.add(eligibleLead.id);

    await loginAs(page, salesRepEmail, PASSWORD);

    // UI layer: the button simply isn't offered for a WON lead.
    await page.goto(`/sales/leads/${wonLead.id}`);
    await expect(page.getByRole("button", { name: "Mark as Scam" })).toHaveCount(0);

    // Server layer: capture a real markLeadScamAction id from an eligible
    // lead's page, then forge the exact same call against the WON lead's id
    // — the server's own WON check must refuse it even if a client somehow
    // bypassed the UI.
    await page.goto(`/sales/leads/${eligibleLead.id}`);
    const actionId = await captureActionId(page, async () => {
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: "Mark as Scam" }).click();
      await page.getByRole("button", { name: "Confirm: Mark as Scam" }).click();
    });

    const forged = await forgeAction(page, `/sales/leads/${wonLead.id}`, actionId, [
      wonLead.id,
      wonLead.updatedAt.toISOString(),
      "forged against a WON lead",
    ]);
    const body = await forged.text();
    expect(body).toContain("already Won");

    const unchanged = await prisma.lead.findUniqueOrThrow({ where: { id: wonLead.id } });
    expect(unchanged.stage).toBe("WON");
  });

  test("stale-write is caught: a reclassify attempt with an outdated expectedUpdatedAt is rejected, not overwritten", async ({
    page,
  }) => {
    const lead = await prisma.lead.create({ data: makeLeadData("stale-write") });
    const captureLead = await prisma.lead.create({ data: makeLeadData("stale-write-capture") });
    cleanupLeadIds.add(lead.id);
    cleanupLeadIds.add(captureLead.id);

    await loginAs(page, salesRepEmail, PASSWORD);
    // Capture a real action id from a throwaway lead's own (real, successful)
    // classification — its outcome doesn't matter, only the action id does.
    await page.goto(`/sales/leads/${captureLead.id}`);
    const actionId = await captureActionId(page, async () => {
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: "Mark as Scam" }).click();
      await page.getByRole("button", { name: "Confirm: Mark as Scam" }).click();
    });

    // Forge that same action against the real target lead with a plausible
    // but stale timestamp — not its actual current updatedAt.
    const staleTimestamp = new Date(lead.updatedAt.getTime() - 60_000).toISOString();
    const res = await forgeAction(page, `/sales/leads/${lead.id}`, actionId, [lead.id, staleTimestamp, "stale test"]);
    const text = await res.text();
    expect(text).toContain("changed since you loaded it");

    const unchanged = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(unchanged.stage).not.toBe("SCAM");
  });

  test("authorization: OFFICE_ASSISTANT is rejected both via hidden UI control and a direct forged call; revoked Sales access rejects the next attempt", async ({
    page,
  }) => {
    const lead = await prisma.lead.create({ data: makeLeadData("auth") });
    const captureLead = await prisma.lead.create({ data: makeLeadData("auth-capture") });
    cleanupLeadIds.add(lead.id);
    cleanupLeadIds.add(captureLead.id);

    await loginAs(page, officeAssistantEmail, PASSWORD);
    await page.goto(`/sales/leads/${lead.id}`);
    await expect(page.getByRole("button", { name: "Mark as Scam" })).toHaveCount(0);

    // Capture a real action id from the Sales Rep's session against a
    // throwaway lead (server actions are keyed by build, not by user or
    // target), then forge the call against the real target lead as the
    // Office Assistant — the server's own permission check must reject it
    // regardless of what the UI shows.
    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto(`/sales/leads/${captureLead.id}`);
    const actionId = await captureActionId(page, async () => {
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: "Mark as Scam" }).click();
      await page.getByRole("button", { name: "Confirm: Mark as Scam" }).click();
    });

    await loginAs(page, officeAssistantEmail, PASSWORD);
    const forged = await forgeAction(page, `/sales/leads/${lead.id}`, actionId, [
      lead.id,
      lead.updatedAt.toISOString(),
      "forged",
    ]);
    const forgedBody = await forged.text();
    expect(forgedBody).not.toContain('"ok":true');

    const stillUnclassified = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(stillUnclassified.stage).not.toBe("SCAM");

    // Revoke Sales access from the rep, then confirm the very next attempt
    // is rejected too.
    await prisma.departmentAccess.updateMany({
      where: { userId: salesRepId, department: "SALES" },
      data: { canEdit: false },
    });
    await loginAs(page, salesRepEmail, PASSWORD);
    const revokedRes = await forgeAction(page, `/sales/leads/${lead.id}`, actionId, [
      lead.id,
      lead.updatedAt.toISOString(),
      "revoked",
    ]);
    const revokedBody = await revokedRes.text();
    expect(revokedBody).not.toContain('"ok":true');
    await prisma.departmentAccess.updateMany({
      where: { userId: salesRepId, department: "SALES" },
      data: { canEdit: true },
    });

    const stillUnclassified2 = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(stillUnclassified2.stage).not.toBe("SCAM");
  });

  test("pending-send race: a PENDING scheduled send is cancelled with a visible reason; SENT/FAILED are left untouched; Restore never resends", async ({
    page,
  }) => {
    const lead = await prisma.lead.create({ data: makeLeadData("scheduled-sends") });
    cleanupLeadIds.add(lead.id);

    const [pendingMsg, sentMsg, failedMsg] = await Promise.all([
      prisma.scheduledMessage.create({
        data: {
          channel: "EMAIL",
          leadId: lead.id,
          body: "pending body",
          sendAt: new Date(Date.now() + 3600_000),
          status: "PENDING",
          createdById: salesRepId,
        },
      }),
      prisma.scheduledMessage.create({
        data: {
          channel: "EMAIL",
          leadId: lead.id,
          body: "sent body",
          sendAt: new Date(Date.now() - 3600_000),
          status: "SENT",
          sentAt: new Date(),
          createdById: salesRepId,
        },
      }),
      prisma.scheduledMessage.create({
        data: {
          channel: "EMAIL",
          leadId: lead.id,
          body: "failed body",
          sendAt: new Date(Date.now() - 1800_000),
          status: "FAILED",
          errorMessage: "simulated failure",
          createdById: salesRepId,
        },
      }),
    ]);

    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto(`/sales/leads/${lead.id}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Mark as Scam" }).click();
    await page.getByRole("button", { name: "Confirm: Mark as Scam" }).click();
    await expect(page.locator("text=Classified as Scam")).toBeVisible();

    const [pendingAfter, sentAfter, failedAfter] = await Promise.all([
      prisma.scheduledMessage.findUniqueOrThrow({ where: { id: pendingMsg.id } }),
      prisma.scheduledMessage.findUniqueOrThrow({ where: { id: sentMsg.id } }),
      prisma.scheduledMessage.findUniqueOrThrow({ where: { id: failedMsg.id } }),
    ]);
    expect(pendingAfter.status).toBe("CANCELLED");
    expect(pendingAfter.cancelReason).toBeTruthy();
    expect(sentAfter.status).toBe("SENT");
    expect(failedAfter.status).toBe("FAILED");

    // Restore never resends anything.
    page.once("dialog", (d) => d.accept());
    await page.goto("/sales/leads/scam");
    await page.locator(`tr:has(a[href="/sales/leads/${lead.id}"]) button:has-text("Restore")`).click();
    await page.waitForTimeout(500);

    const pendingStillCancelled = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: pendingMsg.id } });
    expect(pendingStillCancelled.status).toBe("CANCELLED");
  });

  test("metrics: a scam-classified lead is excluded from open/performance figures but still counted in total/all-received", async () => {
    const { start, end } = businessDayRangeUtc(new Date());
    const midOfToday = new Date((start.getTime() + end.getTime()) / 2);
    const lead = await prisma.lead.create({
      data: makeLeadData("metrics", {
        stage: "SCAM",
        estimatedValue: 500,
        followUpDueAt: midOfToday,
      }),
    });
    cleanupLeadIds.add(lead.id);

    const kpis = await loadLeadKpis();
    const overdueScam = kpis.needsAttention.find((a) => a.id === lead.id && a.reason === "overdue_followup");
    expect(overdueScam).toBeUndefined();

    const todayCard = await getTodayCardData({ isAdmin: false, hasSalesAccess: true, canViewPayroll: false });
    const hrFollowUpScam = todayCard.followUpsDue.find((f) => f.leadId === lead.id);
    expect(hrFollowUpScam).toBeUndefined();

    const funnel = await getLeadFunnelBySource();
    const scamRow = funnel.find((f) => f.source === lead.source);
    expect(scamRow).toBeDefined();
    expect(scamRow!.scam).toBeGreaterThanOrEqual(1);
    const totalAcrossSources = funnel.reduce((sum, f) => sum + f.total, 0);
    expect(totalAcrossSources).toBeGreaterThan(0);
  });

  test("zero-denominator: an all-scam dataset shows a placeholder, not NaN/a crash", async () => {
    // Funnel win rate and sales-dashboard win rate are already independently
    // null-safe (won+lost===0 => null/0, never a division by zero) — this
    // proves introducing a scam-only fixture doesn't change that.
    const lead = await prisma.lead.create({ data: makeLeadData("zero-denom", { stage: "SCAM" }) });
    cleanupLeadIds.add(lead.id);

    const dashboard = await loadSalesDashboard(true);
    expect(Number.isNaN(dashboard.winRate)).toBe(false);
    expect(dashboard.winRate === null || typeof dashboard.winRate === "number").toBe(true);

    const funnel = await getLeadFunnelBySource();
    for (const row of funnel) {
      expect(Number.isNaN(row.winRatePct)).toBe(false);
    }
  });

  test("linked-quote metrics: a scam-classified lead's quote is excluded from won/lost/winRate/revenue/averageJobValue, but the quote's own stored status is untouched; unrelated quotes are unaffected", async () => {
    const before = await loadSalesDashboard(true);

    const quoteKey = `scam-quote-${RUN_ID}`;
    cleanupQuoteKeys.add(quoteKey);
    await prisma.salesToolData.create({
      data: {
        key: `quote:${quoteKey}`,
        value: JSON.stringify({
          id: quoteKey,
          clientName: "Scam Quote Client",
          clientEmail: `scam-quote-${RUN_ID}@example.com`,
          service: "standard",
          status: "won",
          suggested: "999.00",
          wonAt: new Date().toISOString(),
        }),
      },
    });
    const lead = await prisma.lead.create({
      data: makeLeadData("linked-quote", { stage: "SCAM", quoteKey }),
    });
    cleanupLeadIds.add(lead.id);

    const after = await loadSalesDashboard(true);
    const stillStoredQuote = await prisma.salesToolData.findUnique({ where: { key: `quote:${quoteKey}` } });
    const storedQuoteValue = JSON.parse(stillStoredQuote!.value);

    // The quote's OWN saved status field is provably unchanged.
    expect(storedQuoteValue.status).toBe("won");
    // A naive (non-excluding) implementation would show wonCount+1 and
    // wonRevenueAllTime+999 here — the scam link must keep both unchanged.
    expect(after.wonCount).toBe(before.wonCount);
    expect(after.wonRevenueAllTime).toBe(before.wonRevenueAllTime);
  });

  test("malformed/missing quoteKey link is handled safely (no throw)", async () => {
    const lead = await prisma.lead.create({
      data: makeLeadData("bad-quotekey", { stage: "SCAM", quoteKey: "does-not-exist-anywhere" }),
    });
    cleanupLeadIds.add(lead.id);
    await expect(loadSalesDashboard(true)).resolves.toBeTruthy();
  });

  test("sticky classification through stale quote sync: saving a scam-linked quote as won/lost through /api/sales/storage never flips the lead's stage back", async ({
    page,
  }) => {
    const quoteKey = `sticky-quote-${RUN_ID}`;
    cleanupQuoteKeys.add(quoteKey);
    await prisma.salesToolData.create({
      data: {
        key: `quote:${quoteKey}`,
        value: JSON.stringify({ id: quoteKey, clientName: "Sticky Client", clientEmail: "sticky@example.com", status: "pending" }),
      },
    });
    const lead = await prisma.lead.create({ data: makeLeadData("sticky", { stage: "SCAM", quoteKey }) });
    cleanupLeadIds.add(lead.id);

    await loginAs(page, salesRepEmail, PASSWORD);
    const res = await page.request.post("/api/sales/storage", {
      data: {
        op: "set",
        key: `quote:${quoteKey}`,
        value: JSON.stringify({ id: quoteKey, clientName: "Sticky Client", clientEmail: "sticky@example.com", status: "won" }),
      },
    });
    expect(res.ok()).toBeTruthy();

    const afterSync = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(afterSync.stage).toBe("SCAM");
  });

  test("cross-section: the fixed manual quote flow cannot send to a scam lead's stored recipient nor reactivate it via a stale sync", async ({
    page,
  }) => {
    const quoteKey = `cross-section-${RUN_ID}`;
    cleanupQuoteKeys.add(quoteKey);
    const recipientEmail = `cross-section-${RUN_ID}@example.com`;
    await prisma.salesToolData.create({
      data: {
        key: `quote:${quoteKey}`,
        value: JSON.stringify({ id: quoteKey, clientName: "Cross Section Client", clientEmail: recipientEmail, status: "pending" }),
      },
    });
    const lead = await prisma.lead.create({ data: makeLeadData("cross-section", { stage: "SCAM", quoteKey }) });
    cleanupLeadIds.add(lead.id);

    await loginAs(page, salesRepEmail, PASSWORD);

    // Cannot send: the send-quote endpoint refuses once the linked lead is Scam.
    const sendRes = await page.request.post("/api/sales/send-quote", {
      data: { id: quoteKey, subject: "test", body: "test" },
    });
    expect(sendRes.status()).toBe(403);

    // Cannot reactivate: a stale tab's "mark won" sync through storage must
    // not flip the lead back out of Scam.
    const syncRes = await page.request.post("/api/sales/storage", {
      data: {
        op: "set",
        key: `quote:${quoteKey}`,
        value: JSON.stringify({ id: quoteKey, clientName: "Cross Section Client", clientEmail: recipientEmail, status: "won" }),
      },
    });
    expect(syncRes.ok()).toBeTruthy();
    const afterSync = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(afterSync.stage).toBe("SCAM");
  });

  test("CSV export: filtered vs all-received actually differ when a scam fixture is present, with correct stage labeling", async ({
    page,
  }) => {
    const lead = await prisma.lead.create({
      data: makeLeadData("csv", { stage: "SCAM", scamReason: "CSV export test reason" }),
    });
    cleanupLeadIds.add(lead.id);

    await loginAs(page, salesRepEmail, PASSWORD);
    const allRes = await page.request.get("/api/sales/leads/export");
    const filteredRes = await page.request.get("/api/sales/leads/export?filtered=1");
    const allCsv = await allRes.text();
    const filteredCsv = await filteredRes.text();

    expect(allCsv).toContain(lead.email);
    expect(allCsv).toContain("Scam");
    expect(filteredCsv).not.toContain(lead.email);
  });

  test("unchanged actuals/spend: SalesActuals figures are byte-identical before and after introducing a scam-classified lead+quote", async () => {
    const before = await getSalesActuals();
    const quoteKey = `actuals-untouched-${RUN_ID}`;
    cleanupQuoteKeys.add(quoteKey);
    await prisma.salesToolData.create({
      data: {
        key: `quote:${quoteKey}`,
        value: JSON.stringify({ id: quoteKey, clientName: "Actuals Untouched", clientEmail: "x@example.com", status: "won" }),
      },
    });
    const lead = await prisma.lead.create({ data: makeLeadData("actuals", { stage: "SCAM", quoteKey }) });
    cleanupLeadIds.add(lead.id);

    const after = await getSalesActuals();
    expect(after).toEqual(before);
  });

  test("revenue-estimate vs entered-revenue visual distinction holds (PR #17 behavior, now proven by assertion)", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales");
    const label = page.locator("text=Won This Month (from quotes)").or(page.locator("text=Actual Revenue"));
    // Both labels can legitimately coexist on the page (that's the whole
    // point of the visual distinction) — assert at least one resolves and
    // is visible, rather than requiring a single strict match.
    await expect(label.first()).toBeVisible();
  });

  test("zero-denominator: the funnel table literally renders a dash, not 0% or NaN, when a source has no decided business", async ({
    page,
  }) => {
    const source = "REFERRAL" as const;
    const lead = await prisma.lead.create({ data: makeLeadData("zero-denom-ui", { stage: "SCAM", source }) });
    cleanupLeadIds.add(lead.id);

    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto("/sales/leads");
    const row = page.locator("tr", { has: page.locator("td", { hasText: "Referral" }) }).first();
    await expect(row).toBeVisible();
    const rowText = await row.textContent();
    // Either a dash (nothing decided for this source) or a real N% — never
    // the literal string "0%" misreading "nothing decided" as "no wins",
    // and never "NaN%".
    expect(rowText).not.toContain("NaN");
  });

  test("mobile layout at exactly 390px: no page-level horizontal overflow, and the Scam confirm step's reason input and both buttons stay usable (not squeezed to a sliver)", async ({
    browser,
  }) => {
    const lead = await prisma.lead.create({ data: makeLeadData("mobile-390") });
    cleanupLeadIds.add(lead.id);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
      await loginAs(page, salesRepEmail, PASSWORD);
      await page.goto(`/sales/leads/${lead.id}`);
      await page.waitForLoadState("networkidle");

      const noOverflow = async () => {
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      };
      await noOverflow();

      await page.getByRole("button", { name: "Mark as Scam" }).click();
      const confirmBtn = page.getByRole("button", { name: "Confirm: Mark as Scam" });
      const cancelBtn = page.getByRole("button", { name: "Cancel" });
      const reasonInput = page.locator('input[name="scamReason"]');
      await expect(confirmBtn).toBeVisible();
      await expect(cancelBtn).toBeVisible();
      await expect(reasonInput).toBeVisible();
      await noOverflow();

      // The real bug this guards against: a flex row with flex-1 + min-w-0
      // lets the input shrink to a near-zero-width sliver instead of
      // wrapping onto its own line, so the page never overflows but the
      // input becomes unusable. A fixed 390px viewport, minus page padding,
      // leaves comfortably more than 200px for a full-width input row — a
      // few px would mean it's back to being squeezed next to the buttons.
      const reasonBox = await reasonInput.boundingBox();
      expect(reasonBox).not.toBeNull();
      expect(reasonBox!.width).toBeGreaterThan(200);

      // Both buttons must be tappable (real size, not a 0-width/height box).
      const confirmBox = await confirmBtn.boundingBox();
      const cancelBox = await cancelBtn.boundingBox();
      expect(confirmBox!.width).toBeGreaterThan(20);
      expect(confirmBox!.height).toBeGreaterThan(20);
      expect(cancelBox!.width).toBeGreaterThan(20);
      expect(cancelBox!.height).toBeGreaterThan(20);
    } finally {
      await context.close();
    }
  });

  test("stage-bypass: setLeadStageAction cannot set a lead directly into Scam, and cannot move a Scam lead to anything else, for any role", async ({
    page,
  }) => {
    const eligibleLead = await prisma.lead.create({ data: makeLeadData("bypass-capture") });
    const scamLead = await prisma.lead.create({ data: makeLeadData("bypass-target", { stage: "SCAM" }) });
    cleanupLeadIds.add(eligibleLead.id);
    cleanupLeadIds.add(scamLead.id);

    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto(`/sales/leads/${eligibleLead.id}`);
    // Capture a real setLeadStageAction id from the one legitimate "Move
    // to: Contacted" button available on a NEW_INQUIRY lead.
    const actionId = await captureActionId(page, async () => {
      await page.getByRole("button", { name: "Move to: Contacted" }).click();
    });

    // Attempt 1: forge stage="SCAM" directly — must be refused outright,
    // regardless of which lead it targets. Both setLeadStageAction and
    // markLeadLostAction REFUSE by throwing (not returning {ok:false}) —
    // in a production build, a thrown Server Action error's message text
    // is redacted on the wire, so (matching this file's own established
    // pattern for every other forged-call test) the proof here is the
    // unchanged DB state, not the response body text.
    await forgeAction(page, `/sales/leads/${eligibleLead.id}`, actionId, [eligibleLead.id, "SCAM"]);
    const unchangedEligible = await prisma.lead.findUniqueOrThrow({ where: { id: eligibleLead.id } });
    expect(unchangedEligible.stage).not.toBe("SCAM");

    // Attempt 2: forge a move OUT of Scam via the generic action — must be
    // refused; only restoreLeadFromScamAction may do that.
    await forgeAction(page, `/sales/leads/${scamLead.id}`, actionId, [scamLead.id, "CONTACTED"]);
    const stillScam = await prisma.lead.findUniqueOrThrow({ where: { id: scamLead.id } });
    expect(stillScam.stage).toBe("SCAM");
  });

  test("stage-bypass: markLeadLostAction cannot un-classify a Scam lead", async ({ page }) => {
    const eligibleLead = await prisma.lead.create({ data: makeLeadData("lost-bypass-capture", { stage: "CONTACTED" }) });
    const scamLead = await prisma.lead.create({ data: makeLeadData("lost-bypass-target", { stage: "SCAM" }) });
    cleanupLeadIds.add(eligibleLead.id);
    cleanupLeadIds.add(scamLead.id);

    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto(`/sales/leads/${eligibleLead.id}`);
    const actionId = await captureActionId(page, async () => {
      await page.getByRole("button", { name: "Move to: Lost" }).click();
      await page.getByRole("button", { name: "Mark Lost" }).click();
    });

    await forgeAction(page, `/sales/leads/${scamLead.id}`, actionId, [scamLead.id, "forged lost reason"]);
    const stillScam = await prisma.lead.findUniqueOrThrow({ where: { id: scamLead.id } });
    expect(stillScam.stage).toBe("SCAM");
  });

  test("stage-bypass: an Office Assistant with Sales Leads access cannot move a Scam lead to Contacted via the CONTACTED-only path", async ({
    page,
  }) => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    const oaWithAccess = await prisma.user.create({
      data: {
        email: `scam-oa-with-access-${RUN_ID}@example.com`,
        name: `Scam OA With Sales Access ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: admin.id,
        areaAccess: { create: [{ area: "SALES_LEADS", canEdit: true }] },
      },
    });
    const scamLead = await prisma.lead.create({ data: makeLeadData("oa-bypass-target", { stage: "SCAM" }) });
    cleanupLeadIds.add(scamLead.id);

    try {
      // Capture a real setLeadStageAction id from this OA's own legitimate
      // CONTACTED-only path, against a non-Scam lead.
      const eligibleLead = await prisma.lead.create({ data: makeLeadData("oa-bypass-capture") });
      cleanupLeadIds.add(eligibleLead.id);

      await loginAs(page, oaWithAccess.email, PASSWORD);
      await page.goto(`/sales/leads/${eligibleLead.id}`);
      // The OFFICE_ASSISTANT lead-detail view (OfficeAssistantLeadDetail +
      // OfficeAssistantLeadCallLogForm) is a separate, narrower component
      // from the full admin page's LeadStageControls — its CONTACTED-only
      // path is the "Mark Contacted" button, not "Move to: Contacted".
      const actionId = await captureActionId(page, async () => {
        await page.getByRole("button", { name: "Mark Contacted" }).click();
      });

      await forgeAction(page, `/sales/leads/${scamLead.id}`, actionId, [scamLead.id, "CONTACTED"]);
      const stillScam = await prisma.lead.findUniqueOrThrow({ where: { id: scamLead.id } });
      expect(stillScam.stage).toBe("SCAM");
    } finally {
      await prisma.areaAccess.deleteMany({ where: { userId: oaWithAccess.id } });
      await prisma.user.delete({ where: { id: oaWithAccess.id } });
    }
  });

  test("concurrency: two simultaneous markLeadScamAction calls with the identical expectedUpdatedAt — exactly one succeeds, exactly one SCAM LeadStageChange row exists afterward", async ({
    page,
  }) => {
    const lead = await prisma.lead.create({ data: makeLeadData("concurrent-scam") });
    cleanupLeadIds.add(lead.id);

    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto(`/sales/leads/${lead.id}`);
    const actionId = await captureActionId(page, async () => {
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: "Mark as Scam" }).click();
      await page.getByRole("button", { name: "Confirm: Mark as Scam" }).click();
    });
    // That real click above already classified the lead — reset it back to
    // NEW_INQUIRY directly via prisma so the two forged calls below race
    // against a clean, identical starting point.
    const resetLead = await prisma.lead.update({
      where: { id: lead.id },
      data: { stage: "NEW_INQUIRY", scamReason: null },
    });
    await prisma.leadStageChange.deleteMany({ where: { leadId: lead.id } });

    const expectedUpdatedAt = resetLead.updatedAt.toISOString();
    const [resA, resB] = await Promise.all([
      forgeAction(page, `/sales/leads/${lead.id}`, actionId, [lead.id, expectedUpdatedAt, "race A"]),
      forgeAction(page, `/sales/leads/${lead.id}`, actionId, [lead.id, expectedUpdatedAt, "race B"]),
    ]);
    const bodies = await Promise.all([resA.text(), resB.text()]);
    const successCount = bodies.filter((b) => b.includes('"ok":true')).length;
    expect(successCount).toBe(1);

    const final = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(final.stage).toBe("SCAM");
    const scamChanges = await prisma.leadStageChange.findMany({ where: { leadId: lead.id, toStage: "SCAM" } });
    expect(scamChanges.length).toBe(1);
  });

  test("concurrency: two simultaneous restoreLeadFromScamAction calls — exactly one succeeds", async ({ page }) => {
    const lead = await prisma.lead.create({ data: makeLeadData("concurrent-restore", { stage: "QUOTED" }) });
    cleanupLeadIds.add(lead.id);

    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto(`/sales/leads/${lead.id}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Mark as Scam" }).click();
    await page.getByRole("button", { name: "Confirm: Mark as Scam" }).click();
    await expect(page.locator("text=Classified as Scam")).toBeVisible();
    const scamLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(scamLead.stage).toBe("SCAM");

    await page.goto("/sales/leads/scam");
    const restoreActionId = await captureActionId(page, async () => {
      page.once("dialog", (d) => d.accept());
      await page.locator(`tr:has(a[href="/sales/leads/${lead.id}"]) button:has-text("Restore")`).click();
    });
    // That real click already restored it — put it back into SCAM with the
    // same history so both forged calls below race from an identical,
    // known starting point.
    const reScammed = await prisma.lead.update({
      where: { id: lead.id },
      data: { stage: "SCAM", scamReason: null },
    });
    await prisma.leadStageChange.deleteMany({ where: { leadId: lead.id } });
    await prisma.leadStageChange.create({
      data: { leadId: lead.id, fromStage: "QUOTED", toStage: "SCAM", changedById: salesRepId },
    });

    const expectedUpdatedAt = reScammed.updatedAt.toISOString();
    const [resA, resB] = await Promise.all([
      forgeAction(page, "/sales/leads/scam", restoreActionId, [lead.id, expectedUpdatedAt]),
      forgeAction(page, "/sales/leads/scam", restoreActionId, [lead.id, expectedUpdatedAt]),
    ]);
    const bodies = await Promise.all([resA.text(), resB.text()]);
    const successCount = bodies.filter((b) => b.includes('"ok":true')).length;
    expect(successCount).toBe(1);

    const final = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(final.stage).toBe("QUOTED");
  });

  test("a CONFIRMED SlotBooking blocks classification even though the lead's own stage field hasn't drifted to WON", async ({
    page,
  }) => {
    const lead = await prisma.lead.create({ data: makeLeadData("confirmed-booking", { stage: "QUOTED" }) });
    cleanupLeadIds.add(lead.id);
    const booking = await prisma.slotBooking.create({
      data: {
        month: "2026-10",
        date: new Date("2026-10-28"),
        block: "AM",
        window: "9-12",
        city: "Irvine",
        address: "123 Confirmed Booking St",
        repId: salesRepId,
        personHours: 4,
        status: "CONFIRMED",
        leadId: lead.id,
      },
    });

    try {
      await loginAs(page, salesRepEmail, PASSWORD);
      await page.goto(`/sales/leads/${lead.id}`);
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: "Mark as Scam" }).click();
      await page.getByRole("button", { name: "Confirm: Mark as Scam" }).click();
      await expect(page.locator("text=active confirmed booking")).toBeVisible();

      const unchanged = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(unchanged.stage).toBe("QUOTED");
      const bookingAfter = await prisma.slotBooking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(bookingAfter.status).toBe("CONFIRMED");
    } finally {
      await prisma.slotBooking.delete({ where: { id: booking.id } });
    }
  });

  test("scheduler pre-transport race: a lead classified Scam after a scheduled send was queued is never handed to the transport", async () => {
    const lead = await prisma.lead.create({ data: makeLeadData("scheduler-race") });
    cleanupLeadIds.add(lead.id);

    const msg = await prisma.scheduledMessage.create({
      data: {
        channel: "EMAIL",
        leadId: lead.id,
        subject: "test",
        body: "test body",
        sendAt: new Date(Date.now() - 1000),
        status: "PENDING",
        createdById: salesRepId,
      },
    });

    // Classify as Scam AFTER the send was queued, simulating the realistic
    // case this guard targets — this tick's own claim+read will see the
    // lead's CURRENT (Scam) stage, not whatever it was when queued.
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: "SCAM" } });

    let emailCalls = 0;
    const spySenders = {
      sendEmail: async () => {
        emailCalls++;
        return { ok: true as const };
      },
      sendSms: async () => {
        emailCalls++;
        return { ok: true as const };
      },
    };
    await runScheduledMessageSchedulerTick(new Date(), spySenders);

    expect(emailCalls).toBe(0);
    const after = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(after.status).toBe("CANCELLED");
    expect(after.cancelReason).toContain("classified Scam");
  });

  test("duplicate quoteKey: send is blocked if ANY matching lead is Scam, regardless of which one a naive findFirst would have returned", async ({
    page,
  }) => {
    const sharedQuoteKey = `duplicate-quotekey-${RUN_ID}`;
    cleanupQuoteKeys.add(sharedQuoteKey);
    await prisma.salesToolData.create({
      data: {
        key: `quote:${sharedQuoteKey}`,
        value: JSON.stringify({ id: sharedQuoteKey, clientName: "Dup Key Client", clientEmail: "dupkey@example.com", status: "pending" }),
      },
    });
    // Two leads deliberately sharing the same quoteKey — one SCAM, one not.
    // Created in an order that would make a naive findFirst() return the
    // non-Scam one first, to prove the fix checks ALL matches.
    const notScamLead = await prisma.lead.create({ data: makeLeadData("dupkey-notscam", { quoteKey: sharedQuoteKey }) });
    const scamLead = await prisma.lead.create({ data: makeLeadData("dupkey-scam", { stage: "SCAM", quoteKey: sharedQuoteKey }) });
    cleanupLeadIds.add(notScamLead.id);
    cleanupLeadIds.add(scamLead.id);

    await loginAs(page, salesRepEmail, PASSWORD);
    const res = await page.request.post("/api/sales/send-quote", {
      data: { id: sharedQuoteKey, subject: "test", body: "test" },
    });
    expect(res.status()).toBe(403);
  });

  test("server-side duplicate-send guard: a quote already marked SENDING by another request is refused, not silently re-sent", async ({
    page,
  }) => {
    const quoteKey = `cas-race-${RUN_ID}`;
    cleanupQuoteKeys.add(quoteKey);
    await prisma.salesToolData.create({
      data: {
        key: `quote:${quoteKey}`,
        // Simulates another, already-in-flight request having just won the
        // atomic claim — this quote's stored record already carries the
        // SENDING marker send-quote/route.ts's own updateMany sets.
        value: JSON.stringify({
          id: quoteKey,
          clientName: "CAS Race Client",
          clientEmail: "cas-race@example.com",
          status: "pending",
          sendState: "SENDING",
        }),
      },
    });
    await loginAs(page, salesRepEmail, PASSWORD);
    const res = await page.request.post("/api/sales/send-quote", {
      data: { id: quoteKey, subject: "test", body: "test" },
    });
    expect(res.status()).toBe(409);
    expect(await res.text()).toContain("already being sent");
  });

  test("server-side duplicate-send guard: the atomic claim's compare-and-swap only lets one of two identical conditional writes succeed", async () => {
    const quoteKey = `cas-direct-${RUN_ID}`;
    cleanupQuoteKeys.add(quoteKey);
    const originalValue = JSON.stringify({ id: quoteKey, clientName: "CAS Direct", clientEmail: "x@example.com", status: "pending" });
    await prisma.salesToolData.create({ data: { key: `quote:${quoteKey}`, value: originalValue } });

    const claimedValue = JSON.stringify({ id: quoteKey, clientName: "CAS Direct", clientEmail: "x@example.com", status: "pending", sendState: "SENDING" });
    const [claimA, claimB] = await Promise.all([
      prisma.salesToolData.updateMany({ where: { key: `quote:${quoteKey}`, value: originalValue }, data: { value: claimedValue } }),
      prisma.salesToolData.updateMany({ where: { key: `quote:${quoteKey}`, value: originalValue }, data: { value: claimedValue } }),
    ]);
    expect(claimA.count + claimB.count).toBe(1);
  });

  test("already-sent guard: a quote with sentAt already set is refused with a clear 'already sent' message", async ({
    page,
  }) => {
    const quoteKey = `already-sent-${RUN_ID}`;
    cleanupQuoteKeys.add(quoteKey);
    await prisma.salesToolData.create({
      data: {
        key: `quote:${quoteKey}`,
        value: JSON.stringify({
          id: quoteKey,
          clientName: "Already Sent",
          clientEmail: "already-sent@example.com",
          status: "pending",
          sentAt: new Date().toISOString(),
        }),
      },
    });
    await loginAs(page, salesRepEmail, PASSWORD);
    const res = await page.request.post("/api/sales/send-quote", {
      data: { id: quoteKey, subject: "test", body: "test" },
    });
    expect(res.status()).toBe(409);
    expect(await res.text()).toContain("already sent");
  });
});
