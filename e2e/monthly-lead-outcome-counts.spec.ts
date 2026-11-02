import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { getMonthlyLeadOutcomeCounts } from "../src/lib/leads";

// Item 3: prominent calendar-month Won/Lost lead counts (from
// LeadStageChange, not the quote blobs), with the existing all-time counts
// kept fully visible but moved to the end of the Stat grid.
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

test.describe("getMonthlyLeadOutcomeCounts", () => {
  const leadIds: string[] = [];

  test.afterAll(async () => {
    await prisma.leadStageChange.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  });

  test("counts only this calendar month's Won/Lost LeadStageChange rows", async () => {
    const now = new Date();
    const before = await getMonthlyLeadOutcomeCounts(now);

    const makeLead = (label: string) =>
      prisma.lead.create({
        data: {
          firstName: `MonthlyOutcome${label}${RUN_ID}`,
          lastName: "Lead",
          email: `monthly-outcome-${label}-${RUN_ID}@example.com`,
          phone: "9495554444",
          source: "WEBSITE_FORM",
          stage: "NEW_INQUIRY",
        },
      });

    const [wonThisMonthLead, lostThisMonthLead, wonLastMonthLead] = await Promise.all([
      makeLead("won-this-month"),
      makeLead("lost-this-month"),
      makeLead("won-last-month"),
    ]);
    leadIds.push(wonThisMonthLead.id, lostThisMonthLead.id, wonLastMonthLead.id);

    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

    await prisma.leadStageChange.createMany({
      data: [
        { leadId: wonThisMonthLead.id, fromStage: "QUOTED", toStage: "WON", createdAt: now },
        { leadId: lostThisMonthLead.id, fromStage: "QUOTED", toStage: "LOST", createdAt: now },
        // A real outcome, but last calendar month — must NOT be counted now.
        { leadId: wonLastMonthLead.id, fromStage: "QUOTED", toStage: "WON", createdAt: lastMonth },
      ],
    });

    const after = await getMonthlyLeadOutcomeCounts(now);
    expect(after.wonThisMonth).toBe(before.wonThisMonth + 1);
    expect(after.lostThisMonth).toBe(before.lostThisMonth + 1);

    // Querying with `now` set to last month picks up the backdated row
    // instead — proves the boundary is the calendar month passed in, not
    // "ever".
    const lastMonthCounts = await getMonthlyLeadOutcomeCounts(lastMonth);
    expect(lastMonthCounts.wonThisMonth).toBeGreaterThanOrEqual(1);
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
