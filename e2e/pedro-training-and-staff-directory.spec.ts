import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { STAFF_ROLES } from "../src/lib/staff";

// Two fixes for Office Assistants who are also active technicians (Pedro's
// situation): (1) an Office Assistant with Training area access had no way
// to find /modules, /progress, or /glossary — no sidebar link, and the Home
// page's training button sent them to /hr, which has no route to lessons;
// (2) Office Assistant accounts were invisible on the owner's Staff
// Directory because its queries filter through STAFF_ROLES, which never
// included OFFICE_ASSISTANT. Covers: nav/button visibility keyed to the
// Training area grant (not role), None-access hiding both, module
// sequencing is untouched, the owner-facing Directory section and its
// owner-only "Manage Access" link, and that technician nav and the
// payroll/turnover/headcount stats (which must stay STAFF_ROLES-scoped)
// are unaffected. No real progress is written for any role — every account
// here is a disposable fixture, and module/progress pages are only ever
// viewed, never completed.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();
const TRAINING_EXPERIENCE_VERSION_KEY = "training_experience_version";

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe.serial("Pedro: Office Assistant training navigation + owner Staff Directory", () => {
  let adminId: string;
  let oaWithTrainingId: string;
  let oaNoTrainingId: string;
  let serviceManagerId: string;
  let traineeId: string;
  const oaWithTrainingEmail = `oa-training-${RUN_ID}@example.com`;
  const oaNoTrainingEmail = `oa-no-training-${RUN_ID}@example.com`;
  const serviceManagerEmail = `svcmgr-directory-${RUN_ID}@example.com`;
  const traineeEmail = `trainee-nav-${RUN_ID}@example.com`;
  let originalModeValue: string | null;

  test.beforeAll(async () => {
    // This suite is about the classic /modules nav link + classic lesson
    // sequencing — only the live curriculum while Classic is the active
    // training mode (production defaults to Rookie when unset). Force
    // Classic for this suite's duration and restore whatever was there
    // before in afterAll.
    const existingSetting = await prisma.ownerSetting.findUnique({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY } });
    originalModeValue = typeof existingSetting?.value === "string" ? existingSetting.value : null;
    await prisma.ownerSetting.upsert({
      where: { key: TRAINING_EXPERIENCE_VERSION_KEY },
      create: { key: TRAINING_EXPERIENCE_VERSION_KEY, value: "classic" },
      update: { value: "classic" },
    });

    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    adminId = admin.id;

    const oaWithTraining = await prisma.user.create({
      data: {
        email: oaWithTrainingEmail,
        name: `Pedro Training OA ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
        areaAccess: {
          create: [
            { area: "HR_SUMMARY", canEdit: false },
            // Matches the bug report: Training is already granted Edit.
            { area: "TRAINING", canEdit: true },
            { area: "STAFF_DIRECTORY", canEdit: false },
          ],
        },
      },
    });
    oaWithTrainingId = oaWithTraining.id;

    const oaNoTraining = await prisma.user.create({
      data: {
        email: oaNoTrainingEmail,
        name: `No Training OA ${RUN_ID}`,
        role: "OFFICE_ASSISTANT",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
        areaAccess: {
          create: [{ area: "HR_SUMMARY", canEdit: false }],
        },
      },
    });
    oaNoTrainingId = oaNoTraining.id;

    const serviceManager = await prisma.user.create({
      data: {
        email: serviceManagerEmail,
        name: `SvcMgr Directory ${RUN_ID}`,
        role: "SERVICE_MANAGER",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        approvalManagerId: adminId,
      },
    });
    serviceManagerId = serviceManager.id;

    const trainee = await prisma.user.create({
      data: {
        email: traineeEmail,
        name: `Trainee Nav ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        hireDate: new Date(),
      },
    });
    traineeId = trainee.id;
  });

  test.afterAll(async () => {
    await prisma.areaAccess.deleteMany({
      where: { userId: { in: [oaWithTrainingId, oaNoTrainingId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [oaWithTrainingId, oaNoTrainingId, serviceManagerId, traineeId] } },
    });

    if (originalModeValue === null) {
      await prisma.ownerSetting.deleteMany({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY } });
    } else {
      await prisma.ownerSetting.update({ where: { key: TRAINING_EXPERIENCE_VERSION_KEY }, data: { value: originalModeValue } });
    }
    await prisma.$disconnect();
  });

  test("Office Assistant with Training access sees Training, My Progress, and Glossary in the sidebar", async ({
    page,
  }) => {
    await loginAs(page, oaWithTrainingEmail, PASSWORD);
    await page.goto("/");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    await expect(sidebar.getByText("My Training")).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Training", exact: true })).toHaveAttribute("href", "/modules");
    await expect(sidebar.getByRole("link", { name: "My Progress" })).toHaveAttribute("href", "/progress");
    await expect(sidebar.getByRole("link", { name: "Glossary" })).toHaveAttribute("href", "/glossary");
  });

  test("Office Assistant with Training access: the Home training button goes to /modules", async ({ page }) => {
    await loginAs(page, oaWithTrainingEmail, PASSWORD);
    await page.goto("/");
    const button = page.getByRole("link", { name: "View Training Modules" });
    await expect(button).toHaveAttribute("href", "/modules");
    await button.click();
    await page.waitForURL("/modules");
    await expect(page.locator("h1")).toContainText("Modules");
  });

  test("Office Assistant with Training access: modules stay sequentially locked — module 1 open, module 2 locked", async ({
    page,
  }) => {
    const [first, second] = await prisma.module.findMany({
      where: { published: true },
      orderBy: { order: "asc" },
      take: 2,
      select: { titleEn: true },
    });

    await loginAs(page, oaWithTrainingEmail, PASSWORD);
    await page.goto("/modules");

    await expect(page.getByRole("link", { name: first.titleEn })).toBeVisible();
    // The second module's title still renders as plain text (not a link)
    // and is marked Locked — this fixture never completes module 1, so
    // sequencing must behave exactly as it does for a Trainee.
    const secondModuleItem = page.locator("li", { hasText: second.titleEn });
    await expect(secondModuleItem).toBeVisible();
    await expect(secondModuleItem.getByRole("link", { name: second.titleEn })).toHaveCount(0);
    await expect(secondModuleItem.getByText("Locked — complete the previous module first")).toBeVisible();
  });

  test("Office Assistant with Training set to No access: no training nav links, and the Home button is hidden", async ({
    page,
  }) => {
    await loginAs(page, oaNoTrainingEmail, PASSWORD);
    await page.goto("/");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    await expect(sidebar.getByText("My Training")).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Training", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "My Progress" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Glossary" })).toHaveCount(0);

    // HR_SUMMARY is still granted, so the Training card itself renders
    // (stats only) — just without a button that would send this account
    // somewhere its own Training grant doesn't allow.
    await expect(page.getByText("Training", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "View Training Modules" })).toHaveCount(0);
  });

  test("Technician (Trainee) training navigation is unchanged", async ({ page }) => {
    await loginAs(page, traineeEmail, PASSWORD);
    await page.goto("/");
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    await expect(sidebar.getByText("My Training")).toBeVisible();
    // Whether "Modules" itself appears depends on the owner's separately
    // configured Rookie/Classic training experience, unrelated to this fix —
    // My Progress and Glossary are present either way, so those are what
    // prove the Trainee's own nav group is untouched.
    await expect(sidebar.getByRole("link", { name: "My Progress" })).toHaveAttribute("href", "/progress");
    await expect(sidebar.getByRole("link", { name: "Glossary" })).toHaveAttribute("href", "/glossary");
  });

  test("Owner's Staff Directory shows the Office Assistant account with a Manage Access link to Permissions", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/staff");
    await expect(page.getByText("Office Assistants")).toBeVisible();
    const row = page.locator("tr", { hasText: `Pedro Training OA ${RUN_ID}` });
    await expect(row).toBeVisible();
    await expect(row.getByText(oaWithTrainingEmail)).toBeVisible();
    const manageLink = row.getByRole("link", { name: "Manage Access →" });
    await expect(manageLink).toHaveAttribute("href", "/admin/permissions");
  });

  test("Service Manager sees the Office Assistant account on the Directory, but no Manage Access control (owner-only)", async ({
    page,
  }) => {
    await loginAs(page, serviceManagerEmail, PASSWORD);
    await page.goto("/staff");
    const row = page.locator("tr", { hasText: `Pedro Training OA ${RUN_ID}` });
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: "Manage Access →" })).toHaveCount(0);

    // Not just hidden — actually unreachable, same as every other
    // Admin-only route.
    const res = await page.goto("/admin/permissions");
    expect(new URL(page.url()).pathname).toBe("/");
    expect(res?.status()).toBeLessThan(400);
  });

  test("An Office Assistant's own bounded Staff view never shows the owner's account-management section", async ({
    page,
  }) => {
    // This fixture already has its own STAFF_DIRECTORY view grant (set up
    // in beforeAll, matching Pedro's real access), so /staff is reachable —
    // confirming the boundary holds even when an Office Assistant can
    // legitimately view the directory themselves.
    await loginAs(page, oaWithTrainingEmail, PASSWORD);
    const res = await page.goto("/staff");
    expect(res?.status()).toBe(200);
    await expect(page.getByText("Office Assistants")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Manage Access →" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "+ Add Employee" })).toHaveCount(0);
  });

  test("Payroll/headcount/turnover stats stay scoped to STAFF_ROLES and are unaffected by Office Assistant accounts", async ({
    page,
  }) => {
    expect(STAFF_ROLES).not.toContain("OFFICE_ASSISTANT");

    const [expectedTotalStaff, dbCountIncludingOA] = await Promise.all([
      prisma.user.count({ where: { role: { in: STAFF_ROLES }, active: true, isTestAccount: false } }),
      prisma.user.count({
        where: { role: { in: [...STAFF_ROLES, "OFFICE_ASSISTANT"] }, active: true, isTestAccount: false },
      }),
    ]);
    // Sanity check the fixtures actually exist and would inflate the count
    // if STAFF_ROLES had been (wrongly) widened to include them.
    expect(dbCountIncludingOA).toBeGreaterThan(expectedTotalStaff);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/staff");
    const totalStaffCard = page.locator("div", { hasText: "Total Staff" }).last();
    await expect(totalStaffCard.getByText(String(expectedTotalStaff), { exact: true })).toBeVisible();
  });
});
