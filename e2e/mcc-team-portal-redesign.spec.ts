import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { formatDueDate, getDueSortPriority, getDueStatus } from "../src/lib/checklistDisplay";
import { businessDateKey, fridayOfBusinessWeek, lastDayOfBusinessMonth } from "../src/lib/timezone";

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
const ESTABLISHED_EMAIL = `redesign-established-${RUN_ID}@example.com`;
const ESTABLISHED_PASSWORD = "Test-Password-123!";
const ONBOARDING_EMAIL = `redesign-onboarding-${RUN_ID}@example.com`;
const ONBOARDING_PASSWORD = "Test-Password-123!";
const SALES_REP_EMAIL = `redesign-sales-rep-${RUN_ID}@example.com`;
const SALES_REP_PASSWORD = "Test-Password-123!";

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
  let establishedId: string;
  let onboardingId: string;
  let onboardingDocId: string;
  let salesRepId: string;
  const taskIds: string[] = [];

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

    // Past day 10 (review item #2) — hireDate 20 days ago AND every Day
    // 1-10 lesson/content item actually completed, which is what
    // getEffectiveRookiePosition requires before it defers to the
    // calendar and advances past ROOKIE_DAY (it's catch-up-aware, not a
    // pure date cutoff — see that function's own comment). No onboarding
    // left pending (review item #3 is tested separately, with its own
    // fixture below).
    const established = await prisma.user.create({
      data: {
        email: ESTABLISHED_EMAIL,
        name: `Redesign Established ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(ESTABLISHED_PASSWORD),
        mustSetPassword: false,
        active: true,
        hireDate: new Date(Date.now() - 20 * 86400000),
      },
    });
    establishedId = established.id;

    const rookieDays = await prisma.rookieDay.findMany({
      where: { dayNumber: { lte: 10 } },
      select: {
        lessons: { where: { slot: "ROOKIE_DAY" }, select: { lessonId: true } },
        contentItems: { select: { id: true } },
      },
    });
    const allLessonIds = rookieDays.flatMap((d) => d.lessons.map((l) => l.lessonId));
    const allContentIds = rookieDays.flatMap((d) => d.contentItems.map((c) => c.id));
    if (allLessonIds.length > 0) {
      await prisma.lessonProgress.createMany({
        data: allLessonIds.map((lessonId) => ({ userId: establishedId, lessonId })),
        skipDuplicates: true,
      });
    }
    if (allContentIds.length > 0) {
      await prisma.rookieContentProgress.createMany({
        data: allContentIds.map((contentItemId) => ({ userId: establishedId, contentItemId })),
        skipDuplicates: true,
      });
    }

    // Has one unsigned onboarding document (review item #3).
    const onboardingDoc = await prisma.onboardingDocument.create({
      data: { title: `Redesign Onboarding Doc ${RUN_ID}`, order: 999, assignByDefault: false },
    });
    onboardingDocId = onboardingDoc.id;
    const onboardingUser = await prisma.user.create({
      data: {
        email: ONBOARDING_EMAIL,
        name: `Redesign Onboarding ${RUN_ID}`,
        role: "TRAINEE",
        passwordHash: await hashPassword(ONBOARDING_PASSWORD),
        mustSetPassword: false,
        active: true,
      },
    });
    onboardingId = onboardingUser.id;
    await prisma.onboardingAssignment.create({
      data: { documentId: onboardingDocId, userId: onboardingId, signedAt: null },
    });

    const salesRep = await prisma.user.create({
      data: {
        email: SALES_REP_EMAIL,
        name: `Redesign Sales Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(SALES_REP_PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    salesRepId = salesRep.id;

    // Derived from ONE America/Los_Angeles calendar date, then encoded as
    // pure UTC-midnight calendar dates — the same date-only contract
    // getDaysUntilDue relies on (it reads a stored targetDate's Y/M/D
    // directly as UTC, never reinterpreted through the business timezone).
    // Using a real "now" timestamp here instead (as this fixture used to)
    // ties "due today" to whatever UTC calendar day the test happens to
    // run on, which drifts a day ahead of the Pacific calendar day for
    // several hours after every UTC midnight.
    const [todayYear, todayMonth, todayDay] = businessDateKey(new Date()).split("-").map(Number);
    const overdueDate = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay - 3));
    const todayDate = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay));
    const futureDate = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay + 10));
    const future = await prisma.checklistTask.create({
      data: {
        task: `Redesign future task ${RUN_ID}`,
        frequency: "ONE_TIME",
        owner: "TEAM",
        visibility: "TEAM",
        category: "SALES",
        targetDate: futureDate,
        assigneeId: salesRepId,
        order: 1,
      },
    });
    const overdue = await prisma.checklistTask.create({
      data: {
        task: `Redesign overdue task ${RUN_ID}`,
        frequency: "ONE_TIME",
        owner: "TEAM",
        visibility: "TEAM",
        category: "SALES",
        targetDate: overdueDate,
        assigneeId: salesRepId,
        order: 2,
      },
    });
    const dueToday = await prisma.checklistTask.create({
      data: {
        task: `Redesign due-today task ${RUN_ID}`,
        frequency: "ONE_TIME",
        owner: "TEAM",
        visibility: "TEAM",
        category: "SALES",
        targetDate: todayDate,
        assigneeId: salesRepId,
        order: 3,
      },
    });
    taskIds.push(future.id, overdue.id, dueToday.id);
  });

  test.afterAll(async () => {
    await prisma.checklistTask.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.departmentAccess.deleteMany({ where: { userId: salesRepId } });
    await prisma.onboardingAssignment.deleteMany({ where: { userId: onboardingId } });
    await prisma.onboardingDocument.delete({ where: { id: onboardingDocId } });
    await prisma.areaAccess.deleteMany({ where: { userId: officeAssistantId } });
    await prisma.user.deleteMany({
      where: { id: { in: [traineeId, officeAssistantId, establishedId, onboardingId, salesRepId] } },
    });
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

  // --- Review fixes ---------------------------------------------------

  test("Review fix #1: phone drawer links are readable (dark text) in normal, selected, and hover states", async ({
    page,
  }) => {
    function luminance(rgb: string): number {
      const m = rgb.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
      return (m[0] + m[1] + m[2]) / 3;
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, TRAINEE_EMAIL, TRAINEE_PASSWORD);
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");
    await page.locator('[data-testid="mobile-nav"] button[aria-label="Open menu"]').click();

    const docsLink = page.locator('div[role="dialog"] a', { hasText: "Documents" });
    await expect(docsLink).toBeVisible();
    // Selected (aria-current="page", since we navigated here directly).
    const selectedColor = await docsLink.evaluate((el) => getComputedStyle(el).color);
    expect(luminance(selectedColor)).toBeLessThan(220);

    const otherLink = page.locator('div[role="dialog"] a', { hasText: "Glossary" });
    const normalColor = await otherLink.evaluate((el) => getComputedStyle(el).color);
    expect(luminance(normalColor)).toBeLessThan(220);

    await otherLink.hover();
    const hoverColor = await otherLink.evaluate((el) => getComputedStyle(el).color);
    expect(luminance(hoverColor)).toBeLessThan(220);
  });

  test("Review fix #2: an established employee (past day 10) still has a desktop/drawer route to the Rookie overview and its 30/60/90 milestones", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAs(page, ESTABLISHED_EMAIL, ESTABLISHED_PASSWORD);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Home no longer shows a permanent "Day X of 10" onboarding card.
    await expect(page.getByText(/of 10, keep going/i)).toHaveCount(0);

    // But the sidebar still links to it.
    const sidebarLink = page.locator('[data-testid="desktop-sidebar"]').getByRole("link", {
      name: /Rookie Journey|Camino Rookie/,
    });
    await expect(sidebarLink).toHaveAttribute("href", "/rookie");
    await sidebarLink.click();
    await page.waitForURL(/\/rookie$/);

    await expect(page.getByText("Training Days")).toBeVisible();
    // Days 1-10 remain visible as completed history (not hidden by a
    // calendar cutoff), and a 30/60/90 milestone is now reachable too.
    await expect(page.getByText("Next Milestone", { exact: false })).toBeVisible();

    // Same route from the mobile drawer.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.locator('[data-testid="mobile-nav"] button[aria-label="Open menu"]').click();
    await expect(
      page.locator('div[role="dialog"] a', { hasText: /Rookie Journey|Camino Rookie/ })
    ).toHaveAttribute("href", "/rookie");
  });

  test("Review fix #3: /rookie refuses a Trainee with unsigned onboarding documents, same as every other training page", async ({
    page,
  }) => {
    await loginAs(page, ONBOARDING_EMAIL, ONBOARDING_PASSWORD);
    await page.goto("/rookie");
    await expect(page).toHaveURL(/\/documents/);
    await expect(page.getByText("Training Days")).toHaveCount(0);
  });

  test("Review fix #4: Sales Rep My Tasks shows overdue tasks first, then due-today, then later — with a visible due/overdue indicator, no expansion needed", async ({
    page,
  }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales");
    await page.waitForLoadState("networkidle");

    const myTasks = page.locator('[data-testid="sales-rep-my-tasks"]');
    await expect(myTasks.getByText("Overdue", { exact: true })).toBeVisible();
    await expect(myTasks.getByText("Due soon", { exact: true })).toBeVisible();

    const taskTexts = await myTasks.locator("p.font-medium").allTextContents();
    const overdueIdx = taskTexts.findIndex((t) => t.includes("overdue task"));
    const dueTodayIdx = taskTexts.findIndex((t) => t.includes("due-today task"));
    const futureIdx = taskTexts.findIndex((t) => t.includes("future task"));
    expect(overdueIdx).toBeGreaterThanOrEqual(0);
    expect(dueTodayIdx).toBeGreaterThan(overdueIdx);
    expect(futureIdx).toBeGreaterThan(dueTodayIdx);
  });

  test("Review fix #4 regression: a due-today task's classification is stable across UTC midnight as long as the America/Los_Angeles calendar date hasn't changed", () => {
    // Two real instants that straddle a UTC-midnight boundary but are both
    // "Nov 23" in America/Los_Angeles (PST, UTC-8): 11:30pm Pacific on the
    // 23rd is 7:30am UTC on the 24th; 1am Pacific on the 23rd is 9am UTC on
    // the 23rd. This is exactly the window where the old fixture — which
    // stored a raw `now` timestamp as `targetDate` instead of a UTC-midnight
    // calendar date — read "today" as tomorrow for several hours after every
    // UTC midnight, tying the "due today" task's sort priority with "future".
    const justAfterUtcMidnight = new Date("2026-11-24T07:30:00Z");
    const justBeforeUtcMidnight = new Date("2026-11-23T09:00:00Z");
    const pacificDate = "2026-11-23";
    expect(businessDateKey(justAfterUtcMidnight)).toBe(pacificDate);
    expect(businessDateKey(justBeforeUtcMidnight)).toBe(pacificDate);

    const [y, m, d] = pacificDate.split("-").map(Number);
    const dueToday = {
      frequency: "ONE_TIME" as const,
      targetDate: new Date(Date.UTC(y, m - 1, d)).toISOString(),
      effectiveStatus: "NOT_STARTED" as const,
    };

    for (const now of [justAfterUtcMidnight, justBeforeUtcMidnight]) {
      expect(getDueStatus(dueToday, now)).toBe("DUE_SOON");
      expect(getDueSortPriority(dueToday, now)).toBe(1);
    }
  });

  test("Review fix #5: Sales Rep's Won tile says '(from quotes)' so a quote total can't be mistaken for collected revenue", async ({
    page,
  }) => {
    await loginAs(page, SALES_REP_EMAIL, SALES_REP_PASSWORD);
    await page.goto("/sales");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Won This Month (from quotes)")).toBeVisible();
    await expect(page.getByText("Won This Month", { exact: true })).toHaveCount(0);
  });
});

// Review fix #6: AssignedChecklist's collapsed "Due {date}" label used
// effectiveDue.toLocaleDateString() with no timeZone argument. That
// re-reads a UTC-midnight-encoded effective date (every date
// getEffectiveTargetDate returns, manual or computed) as if its Y/M/D
// digits were local wall-clock time — in a timezone behind UTC, like
// America/Los_Angeles, that lands one calendar day early. The due-today/
// overdue ordering itself was unaffected (it's computed from the business
// timezone, not the browser's), only this label's text. A separate,
// non-serial describe block with its own fixtures and a pinned
// `timezoneId`, so this doesn't accidentally pass just because CI happens
// to run in UTC, and doesn't disturb the main suite's shared fixtures.
test.describe("Review fix #6: due-date label doesn't shift a day in America/Los_Angeles", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  const TZ_RUN_ID = `${Date.now()}-tz`;
  const TZ_EMAIL = `redesign-tz-${TZ_RUN_ID}@example.com`;
  const TZ_PASSWORD = "Test-Password-123!";
  let tzUserId: string;
  const tzTaskIds: string[] = [];
  // Manual (One-Time) due date, ~60 days out so it's never "overdue"/"due
  // soon" regardless of which day the suite runs — this test only checks
  // the label text, not the badge (that's review fix #4's job).
  const manualDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 60));

  test.beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: TZ_EMAIL,
        name: `Redesign TZ ${TZ_RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(TZ_PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    tzUserId = user.id;

    const manual = await prisma.checklistTask.create({
      data: {
        task: `Redesign TZ manual task ${TZ_RUN_ID}`,
        frequency: "ONE_TIME",
        owner: "TEAM",
        visibility: "TEAM",
        category: "SALES",
        targetDate: manualDate,
        assigneeId: tzUserId,
        order: 1,
      },
    });
    // Monthly tasks always display the last day of the current business
    // month (getEffectiveTargetDate ignores any stored targetDate for
    // MONTHLY tasks entirely), so no targetDate is needed here.
    const monthly = await prisma.checklistTask.create({
      data: {
        task: `Redesign TZ monthly task ${TZ_RUN_ID}`,
        frequency: "MONTHLY",
        owner: "TEAM",
        visibility: "TEAM",
        category: "SALES",
        assigneeId: tzUserId,
        order: 2,
      },
    });
    // Weekly task opted into a Friday deadline.
    const friday = await prisma.checklistTask.create({
      data: {
        task: `Redesign TZ friday task ${TZ_RUN_ID}`,
        frequency: "WEEKLY",
        dueFridayOfWeek: true,
        owner: "TEAM",
        visibility: "TEAM",
        category: "SALES",
        assigneeId: tzUserId,
        order: 3,
      },
    });
    tzTaskIds.push(manual.id, monthly.id, friday.id);
  });

  test.afterAll(async () => {
    await prisma.checklistTask.deleteMany({ where: { id: { in: tzTaskIds } } });
    await prisma.departmentAccess.deleteMany({ where: { userId: tzUserId } });
    await prisma.user.delete({ where: { id: tzUserId } });
  });

  test("manual, monthly month-end, and Friday-weekly due dates all show their correct calendar day", async ({
    page,
  }) => {
    const now = new Date();
    const expectedManual = formatDueDate(manualDate);
    const expectedMonthEnd = formatDueDate(lastDayOfBusinessMonth(now));
    const expectedFriday = formatDueDate(fridayOfBusinessWeek(now));

    await loginAs(page, TZ_EMAIL, TZ_PASSWORD);
    await page.goto("/sales");
    await page.waitForLoadState("networkidle");

    const myTasks = page.locator('[data-testid="sales-rep-my-tasks"]');
    await expect(myTasks.getByText(`Due ${expectedManual}`, { exact: true })).toBeVisible();
    await expect(myTasks.getByText(`Due ${expectedMonthEnd}`, { exact: true })).toBeVisible();
    await expect(myTasks.getByText(`Due ${expectedFriday}`, { exact: true })).toBeVisible();
  });
});
