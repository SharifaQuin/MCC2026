import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { businessDayRangeUtc } from "../src/lib/timezone";

// Item 2b: Sales's Callbacks list and Home's "Follow-Ups Due" card must
// never disagree about what's due/overdue — both now derive it from the
// single business-day-aware getFollowUpUrgency() helper (src/lib/leads.ts),
// and Home's query no longer excludes follow-ups overdue from a prior day.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const SALES_REP_EMAIL = `followup-consistency-salesrep-${RUN_ID}@example.com`;
const SALES_REP_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe.serial("Sales Callbacks and Home Today card agree on overdue/due-today follow-ups", () => {
  let salesRepId: string;
  let overdueLeadId: string;
  let dueTodayLeadId: string;
  let futureLeadId: string;

  const OVERDUE_NAME = `FollowupOverdue${RUN_ID}`;
  const DUE_TODAY_NAME = `FollowupDueToday${RUN_ID}`;
  const FUTURE_NAME = `FollowupFuture${RUN_ID}`;

  test.beforeAll(async () => {
    const salesRep = await prisma.user.create({
      data: {
        email: SALES_REP_EMAIL,
        name: `Followup Consistency Sales Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(SALES_REP_PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = salesRep.id;

    const now = new Date();
    const { start, end } = businessDayRangeUtc(now);
    // Yesterday's business day, relative to the business timezone — clearly
    // overdue regardless of what instant "now" happens to be.
    const yesterday = new Date(start.getTime() - 60 * 60 * 1000);
    // Still within today's business-day window — due, not overdue.
    const laterToday = new Date(end.getTime() - 60 * 1000);
    // Tomorrow's business day — must stay excluded from "due or overdue".
    const tomorrow = new Date(end.getTime() + 60 * 60 * 1000);

    const [overdueLead, dueTodayLead, futureLead] = await Promise.all([
      prisma.lead.create({
        data: {
          firstName: OVERDUE_NAME,
          lastName: "Lead",
          email: `followup-overdue-${RUN_ID}@example.com`,
          phone: "9495558881",
          source: "WEBSITE_FORM",
          stage: "CONTACTED",
          followUpDueAt: yesterday,
        },
      }),
      prisma.lead.create({
        data: {
          firstName: DUE_TODAY_NAME,
          lastName: "Lead",
          email: `followup-duetoday-${RUN_ID}@example.com`,
          phone: "9495558882",
          source: "WEBSITE_FORM",
          stage: "CONTACTED",
          followUpDueAt: laterToday,
        },
      }),
      prisma.lead.create({
        data: {
          firstName: FUTURE_NAME,
          lastName: "Lead",
          email: `followup-future-${RUN_ID}@example.com`,
          phone: "9495558883",
          source: "WEBSITE_FORM",
          stage: "CONTACTED",
          followUpDueAt: tomorrow,
        },
      }),
    ]);
    overdueLeadId = overdueLead.id;
    dueTodayLeadId = dueTodayLead.id;
    futureLeadId = futureLead.id;
  });

  test.afterAll(async () => {
    const ids = [overdueLeadId, dueTodayLeadId, futureLeadId];
    await prisma.leadStageChange.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.lead.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.delete({ where: { id: salesRepId } }).catch(() => {});
    await prisma.$disconnect();
  });

  test("Sales Callbacks: overdue lead is listed and marked overdue; due-today lead is listed but not overdue", async ({
    page,
  }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales/leads");

    // Scope to the Callbacks table specifically — these leads also show up
    // in the plain "Leads" table further down the page, which never shows
    // overdue styling at all, so an unscoped locator would hit both.
    const callbacksBlock = page.getByRole("heading", { name: "Callbacks", exact: true }).locator("xpath=..");
    const overdueRow = callbacksBlock.locator("tr", { hasText: OVERDUE_NAME });
    await expect(overdueRow).toContainText("overdue");

    const dueTodayRow = callbacksBlock.locator("tr", { hasText: DUE_TODAY_NAME });
    await expect(dueTodayRow).toBeVisible();
    await expect(dueTodayRow).not.toContainText("overdue");
  });

  test("Home's Follow-Ups Due card: same overdue lead appears, marked overdue (not 'Nothing today')", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");

    // Scope to the "Follow-Ups Due" subsection's own block (its title's
    // parent <div>) — the surrounding Today card has sibling subsections
    // (Interviews/Overdue Tasks/Payroll) that may independently render
    // their own "Nothing today" text, which would otherwise false-positive
    // a naive whole-card text check.
    const followUpsBlock = page.getByText("Follow-Ups Due", { exact: true }).locator("xpath=..");
    await expect(followUpsBlock).toBeVisible();
    await expect(followUpsBlock).not.toContainText("Nothing today");

    const overdueItem = followUpsBlock.locator("li", { hasText: OVERDUE_NAME });
    await expect(overdueItem).toBeVisible();
    await expect(overdueItem).toContainText("overdue");
  });

  test("Home's Follow-Ups Due card: due-later-today lead appears, not marked overdue", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");

    const followUpsBlock = page.getByText("Follow-Ups Due", { exact: true }).locator("xpath=..");
    const dueTodayItem = followUpsBlock.locator("li", { hasText: DUE_TODAY_NAME });
    await expect(dueTodayItem).toBeVisible();
    await expect(dueTodayItem).not.toContainText("overdue");
  });

  test("Home's Follow-Ups Due card: tomorrow's lead is excluded entirely", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");

    const followUpsBlock = page.getByText("Follow-Ups Due", { exact: true }).locator("xpath=..");
    await expect(followUpsBlock.locator("li", { hasText: FUTURE_NAME })).toHaveCount(0);
  });
});
