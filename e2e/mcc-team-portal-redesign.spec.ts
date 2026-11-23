import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Coverage for the MCC Team Portal visual/navigation refresh: the mobile
// bottom-tab bar for the plain employee (Trainee) experience, the new
// /rookie Training-tab overview page, the consolidated account/profile
// settings, and the Owner/Office Assistant Home shortcut row — all
// presentational/navigational additions on top of existing, unchanged
// data and permission logic. Fixtures only, tagged with a unique run id.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const TRAINEE_EMAIL = `redesign-trainee-${RUN_ID}@example.com`;
const TRAINEE_PASSWORD = "Test-Password-123!";
const OA_EMAIL = `redesign-oa-${RUN_ID}@example.com`;
const OA_PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

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

test.describe.serial("MCC Team Portal redesign", () => {
  let traineeId: string;
  let officeAssistantId: string;

  test.beforeAll(async () => {
    const trainee = await prisma.user.create({
      data: {
        email: TRAINEE_EMAIL,
        name: `Redesign Trainee ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(TRAINEE_PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    traineeId = trainee.id;

    const oa = await prisma.user.create({
      data: {
        email: OA_EMAIL,
        name: `Redesign OA ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(OA_PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    officeAssistantId = oa.id;
  });

  test.afterAll(async () => {
    await prisma.areaAccess.deleteMany({ where: { userId: officeAssistantId } });
    await prisma.user.deleteMany({ where: { id: { in: [traineeId, officeAssistantId] } } });
    await prisma.$disconnect();
  });

  test("Sign-in page is branded and still logs in correctly; a wrong password still shows the existing error", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByText("Mama's Cleaning Crew")).toBeVisible();
    await expect(page.getByText("Team Portal")).toBeVisible();

    await page.fill('input[name="email"]', TRAINEE_EMAIL);
    await page.fill('input[name="password"]', "wrong-password");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();

    await page.fill('input[name="password"]', TRAINEE_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    expect(page.url()).not.toContain("/login");
  });

  test("Trainee mobile: bottom nav shows Home/Training/Docs/Profile, each tab navigates, and the full hamburger menu is still reachable too", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, TRAINEE_EMAIL, TRAINEE_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const bottomNav = page.locator('[data-testid="bottom-nav"]');
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");

    await bottomNav.getByRole("link", { name: "Training" }).click();
    await page.waitForURL(/\/rookie$/);
    await expect(page.locator('[data-testid="bottom-nav"]').getByRole("link", { name: "Training" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await page.locator('[data-testid="bottom-nav"]').getByRole("link", { name: "Docs" }).click();
    await page.waitForURL(/\/documents/);

    await page.locator('[data-testid="bottom-nav"]').getByRole("link", { name: "Profile" }).click();
    await page.waitForURL(/\/account/);

    // Still additive, not a replacement — the drawer menu still opens and
    // reaches every permitted link (e.g. Glossary, not one of the 4 tabs).
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.locator('[data-testid="mobile-nav"] button[aria-label="Open menu"]').click();
    await expect(page.locator('div[role="dialog"] a', { hasText: "Glossary" })).toBeVisible();
  });

  test("Trainee desktop: bottom nav is CSS-hidden (lg:hidden), same sidebar as every other role", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAs(page, TRAINEE_EMAIL, TRAINEE_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="bottom-nav"]')).toBeHidden();
    await expect(page.locator('[data-testid="desktop-sidebar"]')).toBeVisible();
  });

  test("A non-Trainee role never gets the bottom nav, even on a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="bottom-nav"]')).toHaveCount(0);
  });

  test("/rookie overview page shows the training rail and today's work, reusing the same data as Home", async ({
    page,
  }) => {
    await loginAs(page, TRAINEE_EMAIL, TRAINEE_PASSWORD);
    await page.goto("/rookie");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Training Days")).toBeVisible();
    await expect(page.locator("h1")).toContainText(/Rookie Journey|Mi Camino/);
  });

  test("/rookie refuses a non-Trainee role (redirected to Home)", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/rookie");
    await expect(page).toHaveURL(/\/$/);
  });

  test("Account/Profile page: Change Password, Help & Policies, Report a Problem, and Sign out are all reachable from one page", async ({
    page,
  }) => {
    await loginAs(page, TRAINEE_EMAIL, TRAINEE_PASSWORD);
    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("summary").getByText("Change Password")).toBeVisible();
    await expect(page.getByRole("link", { name: /Help/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Report a Problem/ })).toBeVisible();
    await expect(page.getByText("Log out")).toBeVisible();

    // The consolidated language toggle on this page uses the same
    // setLanguageAction the gear dropdown already used — not a new control.
    await page.getByRole("button", { name: "ES" }).click();
    await page.waitForTimeout(300);
    await expect(page.locator("h1")).toContainText("Mi Cuenta");
    await page.getByRole("button", { name: "EN" }).click();
    await page.waitForTimeout(300);

    // Sign-out button on this page actually logs out.
    await page.getByText("Log out").click();
    await page.waitForURL(/\/login/);
  });

  test("Owner Home shows the four department shortcut cards, each linking to its real page", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Scoped to <main> — the sidebar's own "Departments" nav group already
    // has links with these same names, which would otherwise collide.
    const main = page.locator("main");
    await expect(main.getByRole("link", { name: /^HR$/ })).toHaveAttribute("href", "/hr");
    await expect(main.getByRole("link", { name: /^Sales$/ })).toHaveAttribute("href", "/sales");
    await expect(main.getByRole("link", { name: /^Operations$/ })).toHaveAttribute("href", "/operations");
    await expect(main.getByRole("link", { name: /^Management$/ })).toHaveAttribute("href", "/management");
  });

  test("Office Assistant Home shortcuts show only grant-filtered work areas, and grow as grants are added", async ({
    page,
  }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const main = page.locator("main");
    await expect(main.getByRole("link", { name: "Recruiting", exact: true })).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Staff", exact: true })).toHaveCount(0);

    await prisma.areaAccess.create({ data: { userId: officeAssistantId, area: "RECRUITING", canEdit: false } });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(main.getByRole("link", { name: "Recruiting", exact: true })).toHaveAttribute("href", "/recruiting");
    await expect(main.getByRole("link", { name: "Staff", exact: true })).toHaveCount(0);
  });

  test("Office Assistant still never sees owner-only Financial Overview or department shortcuts", async ({
    page,
  }) => {
    await loginAs(page, OA_EMAIL, OA_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Financial Overview")).toHaveCount(0);
    await expect(page.locator("main").getByRole("link", { name: /^Management$/ })).toHaveCount(0);
  });
});
