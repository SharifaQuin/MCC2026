import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// A Sales Rep's sidebar ("sales-work" group in src/lib/navigation.ts) gets a
// new "Quote Tool" link to /sales/pricing-tool, inserted between "Leads &
// Callbacks" and the existing "Quotes" link (which stays pointed at the
// separate /sales/quotes saved-quotes list — these are two distinct
// destinations). Office Assistant's own nav (built from a completely
// separate table, OFFICE_ASSISTANT_NAV_LINKS) must gain nothing from this.
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

test.describe.serial("Sales Rep nav: new Quote Tool link", () => {
  let salesRepId: string;
  let pedroId: string;
  const salesRepEmail = `nav-quote-tool-rep-${RUN_ID}@example.com`;
  const pedroEmail = `nav-quote-tool-pedro-${RUN_ID}@example.com`;

  test.beforeAll(async () => {
    const salesRep = await prisma.user.create({
      data: {
        email: salesRepEmail,
        name: `Nav Quote Tool Sales Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = salesRep.id;

    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    const pedro = await prisma.user.create({
      data: {
        email: pedroEmail,
        name: `Nav Quote Tool Pedro ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: admin.id,
        areaAccess: { create: [{ area: "HR_SUMMARY", canEdit: false }] },
      },
    });
    pedroId = pedro.id;
  });

  test.afterAll(async () => {
    await prisma.departmentAccess.deleteMany({ where: { userId: salesRepId } });
    await prisma.areaAccess.deleteMany({ where: { userId: pedroId } });
    await prisma.user.deleteMany({ where: { id: { in: [salesRepId, pedroId] } } });
    await prisma.$disconnect();
  });

  test("Sales Rep: 'Quote Tool' appears between 'Leads & Callbacks' and 'Quotes', links to /sales/pricing-tool", async ({
    page,
  }) => {
    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto("/sales");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');

    const quoteToolLink = sidebar.getByRole("link", { name: "Quote Tool" });
    await expect(quoteToolLink).toBeVisible();
    await expect(quoteToolLink).toHaveAttribute("href", "/sales/pricing-tool");

    const quotesLink = sidebar.getByRole("link", { name: "Quotes", exact: true });
    await expect(quotesLink).toHaveAttribute("href", "/sales/quotes");

    const linkTexts = await sidebar.getByRole("link").allTextContents();
    const leadsIdx = linkTexts.indexOf("Leads & Callbacks");
    const quoteToolIdx = linkTexts.indexOf("Quote Tool");
    const quotesIdx = linkTexts.indexOf("Quotes");
    expect(leadsIdx).toBeGreaterThanOrEqual(0);
    expect(quoteToolIdx).toBe(leadsIdx + 1);
    expect(quotesIdx).toBe(quoteToolIdx + 1);
  });

  test("Quote Tool link actually opens the pricing tool", async ({ page }) => {
    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto("/sales");
    await page.locator('[data-testid="desktop-sidebar"]').getByRole("link", { name: "Quote Tool" }).click();
    await page.waitForURL("**/sales/pricing-tool");
  });

  test("Office Assistant (Pedro): gains no new Sales links from this change", async ({ page }) => {
    await loginAs(page, pedroEmail, PASSWORD);
    await page.goto("/");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    await expect(sidebar.getByRole("link", { name: "Quote Tool" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Leads & Callbacks" })).toHaveCount(0);
  });

  test("ADMIN's own nav is unaffected (no 'sales-work' group applies to Admin)", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    await expect(sidebar.getByRole("link", { name: "Quote Tool" })).toHaveCount(0);
  });
});
