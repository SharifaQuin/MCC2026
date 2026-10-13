import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Coverage for the sidebar/drawer navigation redesign: desktop sidebar with
// labelled, active-highlighted groups; the 390px mobile top bar + drawer
// (overlay, Escape, link-select, focus trap, focus return); role-filtered
// nav reusing existing access rules (and hiding empty groups); the gear
// dropdown's contents (including the staff-only language-toggle hiding);
// language persisting across a fresh login; the Help empty state; and the
// Report a Problem form + owner-only queue. Fixtures only, tagged with a
// unique run id and removed in afterAll.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const OA_EMAIL = `nav-oa-e2e-${RUN_ID}@example.com`;
const OA_PASSWORD = "Test-Password-123!";
const TRAINEE_EMAIL = `nav-trainee-e2e-${RUN_ID}@example.com`;
const TRAINEE_PASSWORD = "Test-Password-123!";
const MANAGER_EMAIL = `nav-manager-e2e-${RUN_ID}@example.com`;
const MANAGER_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled])';

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

test.describe.serial("Dashboard navigation redesign", () => {
  let adminId: string;
  let officeAssistantId: string;
  let traineeId: string;
  let managerId: string;
  let applicantId: string;
  let approvalRequestId: string;

  test.beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;

    const jobPosting = await prisma.jobPosting.findFirstOrThrow({ select: { id: true } });

    const oa = await prisma.user.create({
      data: {
        email: OA_EMAIL,
        name: `Nav OA E2E ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(OA_PASSWORD),
        mustSetPassword: false,
        active: true,
        // Deliberately zero AreaAccess rows — every nav group gated on an
        // area grant should be absent entirely, not shown-but-empty.
      },
    });
    officeAssistantId = oa.id;

    const trainee = await prisma.user.create({
      data: {
        email: TRAINEE_EMAIL,
        name: `Nav Trainee E2E ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(TRAINEE_PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    traineeId = trainee.id;

    const manager = await prisma.user.create({
      data: {
        email: MANAGER_EMAIL,
        name: `Nav Manager E2E ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(MANAGER_PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    managerId = manager.id;

    const applicant = await prisma.applicant.create({
      data: {
        jobPostingId: jobPosting.id,
        firstName: "NavE2E",
        lastName: `Applicant-${RUN_ID}`,
        email: `nav-applicant-${RUN_ID}@example.com`,
        phone: "5555550100",
        stage: "NEW",
      },
    });
    applicantId = applicant.id;

    const approval = await prisma.approvalRequest.create({
      data: {
        requesterId: officeAssistantId,
        managerId: adminId,
        applicantId,
        actionType: "REJECT_APPLICANT",
        rationale: "Does not meet availability.",
        proposedOutcome: "Reject.",
        applicantStageAtRequest: "NEW",
      },
    });
    approvalRequestId = approval.id;
  });

  test.afterAll(async () => {
    await prisma.problemReport.deleteMany({ where: { reporterId: { in: [traineeId] } } });
    await prisma.approvalRequest.delete({ where: { id: approvalRequestId } });
    await prisma.applicant.delete({ where: { id: applicantId } });
    await prisma.areaAccess.deleteMany({ where: { userId: officeAssistantId } });
    await prisma.user.deleteMany({ where: { id: { in: [officeAssistantId, traineeId, managerId] } } });
    await prisma.$disconnect();
  });

  test("Desktop: sidebar shows labelled groups with the active page highlighted", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/financials");
    await page.waitForLoadState("networkidle");

    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("Business Tools")).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Financials" })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: "Assistant" })).not.toHaveAttribute("aria-current", "page");
  });

  test("Mobile 390px: top bar fits with no horizontal scroll, sidebar hidden", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
    await expect(page.locator('[data-testid="desktop-sidebar"]')).toBeHidden();
    await expect(page.locator('[data-testid="mobile-nav"]')).toContainText("Dashboard");
  });

  test("Drawer: opens with focus trapped, Tab wraps within it, closes on overlay tap and returns focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const menuButton = page.locator('[data-testid="mobile-nav"] button[aria-label="Open menu"]');
    await menuButton.click();

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('[data-testid="nav-drawer-overlay"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Close menu"]')).toBeFocused();

    // Shift+Tab from the first focusable element should wrap to the last.
    await page.keyboard.press("Shift+Tab");
    const lastFocusable = dialog.locator(FOCUSABLE_SELECTOR).last();
    await expect(lastFocusable).toBeFocused();

    await page.locator('[data-testid="nav-drawer-overlay"]').click({ position: { x: 350, y: 20 } });
    await expect(dialog).toBeHidden();
    await expect(menuButton).toBeFocused();
  });

  test("Drawer: closes on Escape (returning focus) and on selecting a page (and navigates)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const menuButton = page.locator('[data-testid="mobile-nav"] button[aria-label="Open menu"]');
    await menuButton.click();
    await expect(page.locator('div[role="dialog"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('div[role="dialog"]')).toBeHidden();
    await expect(menuButton).toBeFocused();

    await menuButton.click();
    await page.locator('div[role="dialog"] a', { hasText: "Financials" }).click();
    await page.waitForURL(/\/financials/);
    await expect(page.locator('div[role="dialog"]')).toBeHidden();
  });

  test("Role-filtered nav hides empty groups for Office Assistant, then shows only the granted link", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    await expect(sidebar.getByText("Your Work Areas")).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Recruiting" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "HR Summary" })).toHaveCount(0);

    await prisma.areaAccess.create({ data: { userId: officeAssistantId, area: "ASSIGNED_TASKS", canEdit: false } });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(sidebar.getByText("Your Work Areas")).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "To-Do" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Recruiting" })).toHaveCount(0);
  });

  test("Pending Approvals badge shows the live count in the sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const approvalsLink = page.locator('[data-testid="desktop-sidebar"] a', { hasText: "Pending Approvals" });
    await expect(approvalsLink).toContainText("1");
  });

  test("Gear dropdown: signed-in name, core links, and language toggle hidden for a staff-only role", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator('[data-testid="desktop-sidebar"] button[data-testid="settings-gear"]').click();
    const menu = page.locator('[data-testid="settings-menu"]');
    await expect(menu).toContainText("Signed in as");
    await expect(menu.getByRole("link", { name: "My Account" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Help / Policies & Processes" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Report a Problem" })).toBeVisible();
    await expect(menu.getByText("EN / ES")).toBeVisible();
    await expect(menu.getByRole("button", { name: "Log out" })).toBeVisible();
    await logout(page);

    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.locator('[data-testid="desktop-sidebar"] button[data-testid="settings-gear"]').click();
    await expect(page.locator('[data-testid="settings-menu"]').getByText("EN / ES")).toHaveCount(0);
  });

  test("Language choice persists across a fresh login", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAs(page, TRAINEE_EMAIL, TRAINEE_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator('[data-testid="desktop-sidebar"] button[data-testid="settings-gear"]').click();
    await page.locator('[data-testid="settings-menu"] button', { hasText: "ES" }).click();
    await page.waitForTimeout(500);

    await logout(page);
    await loginAs(page, TRAINEE_EMAIL, TRAINEE_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.locator('[data-testid="desktop-sidebar"] button[data-testid="settings-gear"]').click();
    await expect(page.locator('[data-testid="settings-menu"]').getByRole("link", { name: "Mi Cuenta" })).toBeVisible();

    // Reset back to EN so it doesn't leak into any other test.
    await page.locator('[data-testid="settings-menu"] button', { hasText: "EN" }).click();
    await page.waitForTimeout(300);
  });

  test("Help page shows the honest empty state regardless of search text", async ({ page }) => {
    await loginAs(page, TRAINEE_EMAIL, TRAINEE_PASSWORD);
    await page.goto("/help");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("Policies & Processes");
    await expect(page.getByText("No policies added yet.")).toBeVisible();

    await page.fill('input[type="search"]', "anything-at-all");
    await expect(page.getByText("No policies added yet.")).toBeVisible();
  });

  test("Report a Problem: any role can submit with a confirmation; only the Owner can read the queue", async ({
    page,
  }) => {
    const marker = `Nav e2e marker ${RUN_ID}`;

    await loginAs(page, TRAINEE_EMAIL, TRAINEE_PASSWORD);
    await page.goto("/report-a-problem");
    await page.selectOption("select[name='category']", "BUG_OR_ERROR");
    await page.fill("textarea[name='description']", marker);
    await page.click('button[type="submit"]');
    await expect(page.getByText("Submitted")).toBeVisible();
    await logout(page);

    // A non-owner (Service Manager) is redirected away, not shown the queue.
    await loginAs(page, MANAGER_EMAIL, MANAGER_PASSWORD);
    await page.goto("/owner/problem-reports");
    await expect(page).not.toHaveURL(/problem-reports/);
    expect(await page.content()).not.toContain(marker);
    await logout(page);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/owner/problem-reports");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("Problem Reports");
    await expect(page.getByText(marker)).toBeVisible();
    await expect(page.getByText(`Nav Trainee E2E ${RUN_ID}`)).toBeVisible();
  });
});
