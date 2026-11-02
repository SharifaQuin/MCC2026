import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { getMonthlyLeadOutcomeCounts } from "../src/lib/leads";
import { businessDateKey, zonedTimeToUtc } from "../src/lib/timezone";

// Item 3 (original) + correction round: prominent calendar-month Won/Lost
// lead counts (from LeadStageChange, not the quote blobs), with the
// existing all-time counts kept fully visible but moved to the end of the
// Stat grid.
//
// Correction round: the month boundary is now the *business* timezone's
// (America/Los_Angeles by default), not the server process's own runtime
// timezone (Railway containers default to UTC) — and each lead is counted
// at most once per month, by its *latest* Won/Lost LeadStageChange row in
// that window, not once per matching row. The tests below cover both:
// a genuine Pacific/UTC day-boundary mismatch, a lead re-decided twice in
// the same month (Lost -> reopened -> Lost, and Lost -> reopened -> Won),
// and a genuinely-last-month outcome that must stay out of this month's
// count.
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

// { year, month } (1-12) of `now`'s calendar day in the business timezone.
function businessMonthParts(now: Date): { year: number; month: number } {
  const [year, month] = businessDateKey(now).split("-").map(Number);
  return { year, month };
}

// "YYYY-MM" of the business-timezone month immediately before `now`'s.
function priorBusinessMonthKey(now: Date): string {
  const { year, month } = businessMonthParts(now);
  const priorYear = month === 1 ? year - 1 : year;
  const priorMonth = month === 1 ? 12 : month - 1;
  return `${priorYear}-${String(priorMonth).padStart(2, "0")}`;
}

// The real UTC instant at which `now`'s business-timezone month rolls over
// into the next one (i.e. businessMonthRangeUtc(now).end, recomputed here
// directly from the exported primitives rather than importing a lib
// function the test is meant to be independently checking against).
function nextBusinessMonthStartUtc(now: Date): Date {
  const { year, month } = businessMonthParts(now);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return zonedTimeToUtc(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00`);
}

test.describe("getMonthlyLeadOutcomeCounts", () => {
  const leadIds: string[] = [];

  test.afterAll(async () => {
    await prisma.leadStageChange.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  });

  function makeLead(label: string, stage: "NEW_INQUIRY" = "NEW_INQUIRY") {
    return prisma.lead.create({
      data: {
        firstName: `MonthlyOutcome${label}${RUN_ID}`,
        lastName: "Lead",
        email: `monthly-outcome-${label}-${RUN_ID}@example.com`,
        phone: "9495554444",
        source: "WEBSITE_FORM",
        stage,
      },
    });
  }

  test("counts a Won/Lost outcome dated this calendar month, and keeps last month's out", async () => {
    const now = new Date();
    const before = await getMonthlyLeadOutcomeCounts(now);

    const [wonThisMonthLead, lostThisMonthLead] = await Promise.all([
      makeLead("won-this-month"),
      makeLead("lost-this-month"),
    ]);
    leadIds.push(wonThisMonthLead.id, lostThisMonthLead.id);

    await prisma.leadStageChange.createMany({
      data: [
        { leadId: wonThisMonthLead.id, fromStage: "QUOTED", toStage: "WON", createdAt: now },
        { leadId: lostThisMonthLead.id, fromStage: "QUOTED", toStage: "LOST", createdAt: now },
      ],
    });

    const after = await getMonthlyLeadOutcomeCounts(now);
    expect(after.wonThisMonth).toBe(before.wonThisMonth + 1);
    expect(after.lostThisMonth).toBe(before.lostThisMonth + 1);
  });

  test("a Pacific month-end instant already in the next UTC calendar day still counts in the Pacific month", async () => {
    const now = new Date();
    // The real UTC instant 30 minutes before this Pacific month rolls over
    // — i.e. 11:30pm on the last day of the month, Pacific time. Since
    // Pacific trails UTC by 7-8 hours year-round, this instant has already
    // rolled into the *next* UTC calendar day (and, at a December month
    // end, the next UTC calendar year too). A naive UTC-month-boundary
    // implementation would wrongly bucket this into next month instead.
    const monthEndUtc = nextBusinessMonthStartUtc(now);
    const lastNightPacific = new Date(monthEndUtc.getTime() - 30 * 60 * 1000);
    // Prove the premise: this instant's UTC calendar day really does differ
    // from its Pacific calendar day.
    expect(businessDateKey(lastNightPacific)).not.toBe(lastNightPacific.toISOString().slice(0, 10));

    const nextMonthProbe = new Date(monthEndUtc.getTime() + 24 * 60 * 60 * 1000);
    const beforeThisMonth = await getMonthlyLeadOutcomeCounts(now);
    const beforeNextMonth = await getMonthlyLeadOutcomeCounts(nextMonthProbe);

    const lead = await makeLead("boundary");
    leadIds.push(lead.id);
    await prisma.leadStageChange.create({
      data: { leadId: lead.id, fromStage: "QUOTED", toStage: "WON", createdAt: lastNightPacific },
    });

    const afterThisMonth = await getMonthlyLeadOutcomeCounts(now);
    const afterNextMonth = await getMonthlyLeadOutcomeCounts(nextMonthProbe);

    // Counted in the Pacific month it actually fell in...
    expect(afterThisMonth.wonThisMonth).toBe(beforeThisMonth.wonThisMonth + 1);
    // ...and NOT in the following month, despite its UTC calendar date
    // already being that next month's first day.
    expect(afterNextMonth.wonThisMonth).toBe(beforeNextMonth.wonThisMonth);
  });

  test("Lost -> reopened -> Lost again in the same month counts once, not twice", async () => {
    const now = new Date();
    const before = await getMonthlyLeadOutcomeCounts(now);

    const lead = await makeLead("lost-reopen-lost");
    leadIds.push(lead.id);

    await prisma.leadStageChange.createMany({
      data: [
        { leadId: lead.id, fromStage: "QUOTED", toStage: "LOST", createdAt: new Date(now.getTime()) },
        { leadId: lead.id, fromStage: "LOST", toStage: "CONTACTED", createdAt: new Date(now.getTime() + 1000) },
        { leadId: lead.id, fromStage: "CONTACTED", toStage: "LOST", createdAt: new Date(now.getTime() + 2000) },
      ],
    });

    const after = await getMonthlyLeadOutcomeCounts(now);
    expect(after.lostThisMonth).toBe(before.lostThisMonth + 1);
    expect(after.wonThisMonth).toBe(before.wonThisMonth);
  });

  test("Lost -> reopened -> Won in the same month counts as Won only, not also Lost", async () => {
    const now = new Date();
    const before = await getMonthlyLeadOutcomeCounts(now);

    const lead = await makeLead("lost-reopen-won");
    leadIds.push(lead.id);

    await prisma.leadStageChange.createMany({
      data: [
        { leadId: lead.id, fromStage: "QUOTED", toStage: "LOST", createdAt: new Date(now.getTime()) },
        { leadId: lead.id, fromStage: "LOST", toStage: "CONTACTED", createdAt: new Date(now.getTime() + 1000) },
        { leadId: lead.id, fromStage: "CONTACTED", toStage: "WON", createdAt: new Date(now.getTime() + 2000) },
      ],
    });

    const after = await getMonthlyLeadOutcomeCounts(now);
    expect(after.wonThisMonth).toBe(before.wonThisMonth + 1);
    expect(after.lostThisMonth).toBe(before.lostThisMonth);
  });

  test("an outcome genuinely dated last Pacific month is not counted in this month's query", async () => {
    const now = new Date();
    const priorMonth = priorBusinessMonthKey(now);
    // The 15th at noon Pacific of the prior business-timezone month,
    // constructed via zonedTimeToUtc rather than a bare server-local
    // `new Date(y, m - 1, 15)` — the two can disagree depending on the
    // server's own runtime timezone.
    const lastMonthNoonPacific = zonedTimeToUtc(`${priorMonth}-15T12:00`);

    const beforeThisMonth = await getMonthlyLeadOutcomeCounts(now);
    const beforeLastMonth = await getMonthlyLeadOutcomeCounts(lastMonthNoonPacific);

    const lead = await makeLead("cross-month");
    leadIds.push(lead.id);
    await prisma.leadStageChange.create({
      data: { leadId: lead.id, fromStage: "QUOTED", toStage: "WON", createdAt: lastMonthNoonPacific },
    });

    const afterThisMonth = await getMonthlyLeadOutcomeCounts(now);
    const afterLastMonth = await getMonthlyLeadOutcomeCounts(lastMonthNoonPacific);

    // Not counted in the current month's query...
    expect(afterThisMonth.wonThisMonth).toBe(beforeThisMonth.wonThisMonth);
    // ...but correctly counted when querying the month it actually happened in.
    expect(afterLastMonth.wonThisMonth).toBe(beforeLastMonth.wonThisMonth + 1);
  });
});

test.describe("Sales page shows monthly lead-outcome counts prominently", () => {
  test("Leads Won/Lost This Month tiles appear, positioned before the all-time counts", async ({ page }) => {
    const expected = await getMonthlyLeadOutcomeCounts();

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales");

    const thisMonthSection = page.locator("section", { has: page.getByRole("heading", { name: "This Month" }) });
    await expect(thisMonthSection.getByText("Leads Won This Month", { exact: true })).toBeVisible();
    await expect(thisMonthSection.getByText("Leads Lost This Month", { exact: true })).toBeVisible();
    await expect(thisMonthSection.getByText("Won (all-time)", { exact: true })).toBeVisible();
    await expect(thisMonthSection.getByText("Lost (all-time)", { exact: true })).toBeVisible();

    // Values match the real underlying counts.
    const wonTile = thisMonthSection.getByText("Leads Won This Month", { exact: true }).locator("xpath=..");
    const lostTile = thisMonthSection.getByText("Leads Lost This Month", { exact: true }).locator("xpath=..");
    await expect(wonTile).toContainText(String(expected.wonThisMonth));
    await expect(lostTile).toContainText(String(expected.lostThisMonth));

    // Position: the new monthly tiles read before the de-emphasized
    // all-time ones, which now sit at the end of the grid. Scoped to the
    // main Stat grid specifically (`.first()`) — the Admin-only "Actuals
    // This Month" sub-block below it reuses the same Stat component/classes
    // for its own, unrelated tiles (Actual Revenue/Labor/Profit So Far) and
    // would otherwise be counted too.
    const labels = await thisMonthSection
      .locator("div.grid")
      .first()
      .locator("p.text-xs.font-medium.uppercase")
      .allTextContents();
    const wonMonthlyIdx = labels.indexOf("Leads Won This Month");
    const lostMonthlyIdx = labels.indexOf("Leads Lost This Month");
    const wonAllTimeIdx = labels.indexOf("Won (all-time)");
    const lostAllTimeIdx = labels.indexOf("Lost (all-time)");

    expect(wonMonthlyIdx).toBeGreaterThanOrEqual(0);
    expect(lostMonthlyIdx).toBeGreaterThanOrEqual(0);
    expect(wonAllTimeIdx).toBeGreaterThan(wonMonthlyIdx);
    expect(lostAllTimeIdx).toBeGreaterThan(lostMonthlyIdx);
    // All-time tiles are the very last two in the grid.
    expect(wonAllTimeIdx).toBe(labels.length - 2);
    expect(lostAllTimeIdx).toBe(labels.length - 1);

    // The existing dollar-figure tile ("Actual Revenue" or "Won This Month
    // (from quotes)") is never confused with the new lead counts — distinct
    // label text, and it still reads first, unchanged from before this item.
    expect(["Actual Revenue", "Won This Month (from quotes)"]).toContain(labels[0]);
  });
});
