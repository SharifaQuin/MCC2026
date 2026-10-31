import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Coverage for "stop fresh leads getting buried": /sales/leads' Leads table
// now sorts newest-first (was oldest-first, so a brand-new inquiry sat at
// the bottom), and a lead with no follow-up date is now findable through a
// "Needs Follow-up Date" section rather than disappearing entirely (it was
// never shown in Callbacks, which only ever looks at leads that already
// have a date). No follow-up date is ever invented, and a no-date lead must
// never be shown as a due callback.
const RUN_ID = Date.now().toString();
const SALES_REP_EMAIL = `lead-sort-salesrep-${RUN_ID}@example.com`;
const SALES_REP_PASSWORD = "Test-Password-123!";
const OA_EMAIL = `lead-sort-oa-${RUN_ID}@example.com`;
const OA_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe.serial("Leads table sorts newest-first; no-follow-up-date leads are findable, not due callbacks", () => {
  let salesRepId: string;
  let oaId: string;
  let olderLeadId: string;
  let newerNoDateLeadId: string;
  const OLDER_NAME = `SortOlder${RUN_ID}`;
  const NEWER_NAME = `SortNewer${RUN_ID}`;

  test.beforeAll(async () => {
    const salesRep = await prisma.user.create({
      data: {
        email: SALES_REP_EMAIL,
        name: `Lead Sort Sales Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(SALES_REP_PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = salesRep.id;

    const oa = await prisma.user.create({
      data: {
        email: OA_EMAIL,
        name: `Lead Sort OA ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(OA_PASSWORD),
        mustSetPassword: false,
        active: true,
        areaAccess: { create: [{ area: "SALES_LEADS", canEdit: true }] },
      },
    });
    oaId = oa.id;

    // Deliberately out of createdAt order: the older lead HAS a follow-up
    // date (so it legitimately belongs in Callbacks); the newer one has
    // none (so it must surface only via "Needs Follow-up Date", never as a
    // due callback).
    const older = await prisma.lead.create({
      data: {
        firstName: OLDER_NAME,
        lastName: "Lead",
        email: `lead-sort-older-${RUN_ID}@example.com`,
        phone: "9495552221",
        source: "WEBSITE_FORM",
        stage: "NEW_INQUIRY",
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        followUpDueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
    });
    olderLeadId = older.id;

    const newer = await prisma.lead.create({
      data: {
        firstName: NEWER_NAME,
        lastName: "Lead",
        email: `lead-sort-newer-${RUN_ID}@example.com`,
        phone: "9495552222",
        source: "WEBSITE_FORM",
        stage: "NEW_INQUIRY",
        createdAt: new Date(),
        followUpDueAt: null,
      },
    });
    newerNoDateLeadId = newer.id;
  });

  test.afterAll(async () => {
    await prisma.lead.deleteMany({ where: { id: { in: [olderLeadId, newerNoDateLeadId] } } });
    await prisma.departmentAccess.deleteMany({ where: { userId: salesRepId } });
    await prisma.areaAccess.deleteMany({ where: { userId: oaId } });
    await prisma.user.deleteMany({ where: { id: { in: [salesRepId, oaId] } } });
    await prisma.$disconnect();
  });

  test("Sales Rep's Leads table shows the newer lead above the older one", async ({ page }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales/leads");

    const leadsHeading = page.getByRole("heading", { name: "Leads", exact: true });
    await expect(leadsHeading).toBeVisible();
    const leadsTable = leadsHeading.locator("xpath=following-sibling::*[1]");
    const rows = leadsTable.locator("tbody tr");
    const rowTexts = await rows.allTextContents();

    const newerIndex = rowTexts.findIndex((t) => t.includes(NEWER_NAME));
    const olderIndex = rowTexts.findIndex((t) => t.includes(OLDER_NAME));
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  test("Sales Rep: the no-follow-up-date lead is in 'Needs Follow-up Date', not in Callbacks", async ({ page }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales/leads");

    const needsSectionHeading = page.getByRole("heading", { name: "Needs Follow-up Date" });
    await expect(needsSectionHeading).toBeVisible();
    const needsSection = needsSectionHeading.locator("xpath=following-sibling::*[1]");
    await expect(needsSection.getByText(NEWER_NAME)).toBeVisible();

    const callbacksHeading = page.getByRole("heading", { name: "Callbacks", exact: true });
    const callbacksSection = callbacksHeading.locator("xpath=following-sibling::*[1]");
    await expect(callbacksSection.getByText(NEWER_NAME)).toHaveCount(0);
    await expect(callbacksSection.getByText(OLDER_NAME)).toBeVisible();

    // Never invented: the "Needs Follow-up Date" row shows no date.
    const dbRow = await prisma.lead.findUniqueOrThrow({ where: { id: newerNoDateLeadId } });
    expect(dbRow.followUpDueAt).toBeNull();
  });

  test("Office Assistant: newest-first order and 'Needs Follow-up Date' section both appear", async ({ page }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto("/sales/leads");

    const needsSectionHeading = page.getByRole("heading", { name: "Needs Follow-up Date" });
    await expect(needsSectionHeading).toBeVisible();
    const needsSection = needsSectionHeading.locator("xpath=following-sibling::*[1]");
    await expect(needsSection.getByText(NEWER_NAME)).toBeVisible();
    await expect(needsSection.getByText(OLDER_NAME)).toHaveCount(0);

    // The full list is always the LAST table on the page — the "Needs
    // Follow-up Date" table (if any) renders first and would otherwise put
    // its one row ahead of everything regardless of the main list's order.
    const mainTable = page.locator("table").last();
    const rows = mainTable.locator("tbody tr");
    const rowTexts = await rows.allTextContents();
    const newerIndex = rowTexts.findIndex((t) => t.includes(NEWER_NAME));
    const olderIndex = rowTexts.findIndex((t) => t.includes(OLDER_NAME));
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeLessThan(olderIndex);

    const dbRow = await prisma.lead.findUniqueOrThrow({ where: { id: newerNoDateLeadId } });
    expect(dbRow.followUpDueAt).toBeNull();
  });
});
