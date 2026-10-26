import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Part B of the Rookie-mode brief: owner-only tools relocated out of
// everyday nav and into My Account, plus mode-aware hiding of the classic
// catalog's nav surfaces. Covers:
//  - /account's new ADMIN-only "Owner Tools" section (Legacy Training, Test
//    Accounts, Act As) and that it's absent for a non-admin.
//  - "Test Accounts" is gone from the sidebar's business-tools group and
//    reachable only via /account now; the /test-accounts middleware rule
//    itself is unchanged (still ADMIN-only at the edge).
//  - TrainingTabs hides Modules/Content Editor while Rookie is active and
//    shows them while Classic is active; /admin/rookie-journey and
//    /admin/content stay reachable either way (ADMIN-only, unaffected by
//    this nav-only change).
//  - navigation.ts's Office Assistant /modules link follows the same
//    mode-aware hiding as the Trainee one, on both desktop sidebar and
//    mobile drawer.
// No production data is touched — training-mode is forced and restored via
// the same reversible OwnerSetting pattern used elsewhere in this suite.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const PASSWORD = "Test-Password-123!";
const TRAINING_EXPERIENCE_VERSION_KEY = "training_experience_version";
const SCREENSHOT_DIR =
  "/tmp/claude-0/-home-user-MCC2026/644fd4e9-baf9-519a-bf7c-31648f9553c5/scratchpad/rookie-settings-screenshots";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function setMode(mode: "rookie" | "classic") {
  await prisma.ownerSetting.upsert({
    where: { key: TRAINING_EXPERIENCE_VERSION_KEY },
    create: { key: TRAINING_EXPERIENCE_VERSION_KEY, value: mode },
    update: { value: mode },
  });
}

test.describe.serial("Owner Settings reorg: /account owner tools + mode-aware nav", () => {
  let traineeId: string;
  let oaWithTrainingId: string;
  let originalModeValue: string | null;

  const traineeEmail = `settings-relocation-trainee-${RUN_ID}@example.com`;
  const oaWithTrainingEmail = `settings-relocation-oa-${RUN_ID}@example.com`;

  test.beforeAll(async () => {
    const existingSetting = await prisma.ownerSetting.findUnique({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY } });
    originalModeValue = typeof existingSetting?.value === "string" ? existingSetting.value : null;

    const trainee = await prisma.user.create({
      data: {
        email: traineeEmail,
        name: `Settings Relocation Trainee ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        hireDate: new Date(),
      },
    });
    traineeId = trainee.id;

    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    const oaWithTraining = await prisma.user.create({
      data: {
        email: oaWithTrainingEmail,
        name: `Settings Relocation OA ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: admin.id,
        areaAccess: { create: [{ area: "TRAINING", canEdit: true }] },
      },
    });
    oaWithTrainingId = oaWithTraining.id;
  });

  test.afterAll(async () => {
    await prisma.areaAccess.deleteMany({ where: { userId: oaWithTrainingId } });
    await prisma.user.deleteMany({ where: { id: { in: [traineeId, oaWithTrainingId] } } });

    if (originalModeValue === null) {
      await prisma.ownerSetting.deleteMany({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY } });
    } else {
      await prisma.ownerSetting.update({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY }, data: { value: originalModeValue } });
    }
    await prisma.$disconnect();
  });

  test("ADMIN: /account shows the Owner Tools section with all three working destinations", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/account");
    await expect(page.getByText("Owner Tools")).toBeVisible();

    const legacyTrainingLink = page.getByRole("link", { name: /Legacy Training/ });
    await expect(legacyTrainingLink).toHaveAttribute("href", "/admin/content");

    const testAccountsLink = page.getByRole("link", { name: "Test Accounts" });
    await expect(testAccountsLink).toHaveAttribute("href", "/test-accounts");

    await expect(page.getByRole("heading", { name: "Act As" })).toBeVisible();

    await legacyTrainingLink.click();
    await page.waitForURL("/admin/content");
    await expect(page.getByRole("heading", { name: "Content Editor" })).toBeVisible();

    await page.goto("/account");
    await page.getByRole("link", { name: "Test Accounts" }).click();
    await page.waitForURL("/test-accounts");
    await expect(page.getByRole("heading", { name: "Test Accounts" })).toBeVisible();
    await expect(page.getByRole("button", { name: "View As" }).first()).toBeVisible();
  });

  test("Non-admin (TRAINEE): /account has no Owner Tools section at all", async ({ page }) => {
    await loginAs(page, traineeEmail, PASSWORD);
    await page.goto("/account");
    await expect(page.getByText("Owner Tools")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Legacy Training/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Test Accounts" })).toHaveCount(0);
  });

  test("Test Accounts is gone from the ADMIN sidebar's business-tools group (desktop + mobile), and /test-accounts middleware stays ADMIN-only", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    await expect(sidebar.getByRole("link", { name: "Test Accounts" })).toHaveCount(0);
    // Everything else in that group is still there, unaffected.
    await expect(sidebar.getByRole("link", { name: "Financials" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Rookie Journey" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const menuButton = page.locator('[data-testid="mobile-nav"] button[aria-label="Open menu"]');
    await menuButton.click();
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Test Accounts" })).toHaveCount(0);
    await expect(dialog.getByRole("link", { name: "Financials" })).toBeVisible();

    await loginAs(page, traineeEmail, PASSWORD);
    const res = await page.goto("/test-accounts");
    expect(new URL(page.url()).pathname).toBe("/");
    expect(res?.status()).toBeLessThan(400);
  });

  test("Rookie active: TrainingTabs hides Modules + Content Editor; Classic active: both reappear", async ({ page }) => {
    // Scoped by exact href rather than role name: the Employees list below
    // these tabs shows each employee's own classic-module completion count
    // ("0 / 25 modules"), which would otherwise collide with a
    // case-insensitive substring match on "Modules".
    await setMode("rookie");
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/employees");
    await expect(page.getByRole("link", { name: "Employees" })).toBeVisible();
    await expect(page.locator('a[href="/modules"]')).toHaveCount(0);
    await expect(page.locator('a[href="/admin/content"]')).toHaveCount(0);
    // Unaffected admin-only tabs stay exactly as they were.
    await expect(page.getByRole("link", { name: "Onboarding Docs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Permissions" })).toBeVisible();

    await setMode("classic");
    await page.goto("/admin/employees");
    await expect(page.locator('a[href="/modules"]')).toBeVisible();
    await expect(page.locator('a[href="/admin/content"]')).toBeVisible();
  });

  test("Rookie-mode nav hiding never touches the Rookie-aware editor links themselves", async ({ page }) => {
    await setMode("rookie");
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    await expect(sidebar.getByRole("link", { name: "Rookie Journey" })).toBeVisible();
    const res = await page.goto("/admin/rookie-journey");
    expect(res?.status()).toBe(200);
  });

  test("Office Assistant with Training access: the /modules nav link follows the same mode-aware hiding, desktop + mobile", async ({
    page,
  }) => {
    await setMode("rookie");
    await loginAs(page, oaWithTrainingEmail, PASSWORD);
    await page.goto("/");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    await expect(sidebar.getByText("My Training")).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Training", exact: true })).toHaveCount(0);
    // Progress/Glossary stay — only the classic-catalog link is hidden.
    await expect(sidebar.getByRole("link", { name: "My Progress" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Glossary" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const menuButton = page.locator('[data-testid="mobile-nav"] button[aria-label="Open menu"]');
    await menuButton.click();
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog.getByRole("link", { name: "Training", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("link", { name: "Glossary" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 800 });

    await setMode("classic");
    await page.goto("/");
    await expect(sidebar.getByRole("link", { name: "Training", exact: true })).toHaveAttribute("href", "/modules");

    await setMode("rookie");
  });

  test("Non-admin (TRAINEE) at mobile width: /account still has no Owner Tools section", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, traineeEmail, PASSWORD);
    await page.goto("/account");
    await expect(page.getByText("Owner Tools")).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("Mobile: Settings gear → My Account → all three destinations, including starting and ending an Act As session; an already-impersonated session gets neither the section nor the action", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The Settings gear lives directly in the mobile top bar (not the
    // hamburger drawer) — same component, same testid, as the desktop one.
    // Both sidebars are present in the DOM at once (CSS hides one), so
    // scope to the mobile-nav instance specifically.
    await page.locator('[data-testid="mobile-nav"]').getByTestId("settings-gear").click();
    await page.getByRole("link", { name: "My Account" }).click();
    await page.waitForURL("/account");
    await expect(page.getByText("Owner Tools")).toBeVisible();

    const legacyTrainingLink = page.getByRole("link", { name: /Legacy Training/ });
    await expect(legacyTrainingLink).toHaveAttribute("href", "/admin/content");
    const testAccountsLink = page.getByRole("link", { name: "Test Accounts" });
    await expect(testAccountsLink).toHaveAttribute("href", "/test-accounts");
    await expect(page.getByRole("heading", { name: "Act As" })).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/6-mobile-account-owner-tools.png`, fullPage: true });

    // Start an Act As session at mobile width.
    const row = page.getByTestId(`act-as-row-${oaWithTrainingId}`);
    await row.getByRole("button", { name: "Act As" }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("button", { name: "Return to Owner View" })).toBeVisible();

    // Already-impersonated session: neither the section nor its heading.
    // (Direct forged calls to the relocated action while impersonating are
    // separately covered, at desktop width, by
    // owner-act-as-mode.spec.ts's "No nested impersonation" test — not
    // duplicated here.)
    await page.goto("/account");
    await expect(page.getByText("Owner Tools")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Act As" })).toHaveCount(0);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/7-mobile-account-impersonated-no-owner-tools.png`, fullPage: true });

    // End the Act As session at mobile width — the banner works here too.
    await page.getByRole("button", { name: "Return to Owner View" }).click();
    await page.waitForURL("/");
    await expect(page.getByText("Viewing and acting as")).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 800 });
  });
});
