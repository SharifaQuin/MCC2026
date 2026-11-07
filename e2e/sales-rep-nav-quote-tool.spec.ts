import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// A Sales Rep's sidebar ("sales-work" group in src/lib/navigation.ts) has a
// link to /sales/pricing-tool, inserted between "Leads & Callbacks" and the
// existing "Quotes" link (which stays pointed at the separate /sales/quotes
// saved-quotes list — these are two distinct destinations). That link's
// label was renamed from "Quote Tool" to "Pricing Calculator" (same href,
// same position) as part of the Pricing Calculator / Scam classification
// brief, which also added a standalone "Pricing Calculator" shortcut to
// ADMIN's own Business Tools group (same /sales/pricing-tool destination,
// not a new permission — ADMIN already has unrestricted Sales access).
// Office Assistant's own nav (built from a completely separate table,
// OFFICE_ASSISTANT_NAV_LINKS) must gain nothing from either change.
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

test.describe.serial("Nav: 'Pricing Calculator' link (Sales Rep rename + ADMIN shortcut)", () => {
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

  test("Sales Rep: 'Pricing Calculator' appears between 'Leads & Callbacks' and 'Quotes', same href as before", async ({
    page,
  }) => {
    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto("/sales");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');

    const pricingLink = sidebar.getByRole("link", { name: "Pricing Calculator" });
    await expect(pricingLink).toBeVisible();
    await expect(pricingLink).toHaveAttribute("href", "/sales/pricing-tool");
    await expect(sidebar.getByRole("link", { name: "Quote Tool" })).toHaveCount(0);

    const quotesLink = sidebar.getByRole("link", { name: "Quotes", exact: true });
    await expect(quotesLink).toHaveAttribute("href", "/sales/quotes");

    const linkTexts = await sidebar.getByRole("link").allTextContents();
    const leadsIdx = linkTexts.indexOf("Leads & Callbacks");
    const pricingIdx = linkTexts.indexOf("Pricing Calculator");
    const quotesIdx = linkTexts.indexOf("Quotes");
    expect(leadsIdx).toBeGreaterThanOrEqual(0);
    expect(pricingIdx).toBe(leadsIdx + 1);
    expect(quotesIdx).toBe(pricingIdx + 1);
  });

  test("Sales Rep mobile: 'Pricing Calculator' visible in mobile nav drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto("/sales");
    await page.waitForLoadState("networkidle");
    const menuButton = page.locator('[data-testid="mobile-nav"] button[aria-label="Open menu"]');
    await menuButton.click();
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    const pricingLink = dialog.getByRole("link", { name: "Pricing Calculator" });
    await expect(pricingLink).toBeVisible();
    await expect(pricingLink).toHaveAttribute("href", "/sales/pricing-tool");
  });

  test("'Pricing Calculator' link actually opens the pricing tool", async ({ page }) => {
    await loginAs(page, salesRepEmail, PASSWORD);
    await page.goto("/sales");
    await page.locator('[data-testid="desktop-sidebar"]').getByRole("link", { name: "Pricing Calculator" }).click();
    await page.waitForURL("**/sales/pricing-tool");
  });

  test("Office Assistant (Pedro): gains no new Sales links from either change", async ({ page }) => {
    await loginAs(page, pedroEmail, PASSWORD);
    await page.goto("/");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    await expect(sidebar.getByRole("link", { name: "Pricing Calculator" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Leads & Callbacks" })).toHaveCount(0);
  });

  test("ADMIN desktop: Business Tools gets its own 'Pricing Calculator' shortcut (same destination, no new permission)", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    const pricingLinks = sidebar.getByRole("link", { name: "Pricing Calculator" });
    await expect(pricingLinks).toHaveCount(1);
    await expect(pricingLinks).toHaveAttribute("href", "/sales/pricing-tool");

    // Existing Business Tools entries are undisturbed by the addition.
    const financials = sidebar.getByRole("link", { name: "Financials" });
    const rookieJourney = sidebar.getByRole("link", { name: "Rookie Journey" });
    await expect(financials).toBeVisible();
    await expect(rookieJourney).toBeVisible();
  });

  test("ADMIN mobile: 'Pricing Calculator' shortcut visible in mobile nav drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const menuButton = page.locator('[data-testid="mobile-nav"] button[aria-label="Open menu"]');
    await menuButton.click();
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    const pricingLink = dialog.getByRole("link", { name: "Pricing Calculator" });
    await expect(pricingLink).toBeVisible();
    await expect(pricingLink).toHaveAttribute("href", "/sales/pricing-tool");
  });
});
