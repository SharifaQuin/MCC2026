import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Item 4: the Monthly Goal Stat box itself now also shows the same progress
// text already shown in each page's header badge ("$X to go"/"Goal hit!" on
// /sales, "$X to hit this month's goal"/"Goal hit this month!" on Home) —
// the header badge is kept, unchanged, this just adds the same text inside
// the box too. No goal set (goal === 0) shows neither.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";

const prisma = new PrismaClient();

function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const GOAL_KEY = "sales:goal";
const ACTUALS_KEY = `sales:actuals:${currentMonthKey()}`;
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function setGoalAndActuals(goal: number, revenue: number | null) {
  if (goal > 0) {
    await prisma.salesToolData.upsert({
      where: { key: GOAL_KEY },
      create: { key: GOAL_KEY, value: JSON.stringify({ revenueGoal: goal }) },
      update: { value: JSON.stringify({ revenueGoal: goal }) },
    });
  } else {
    await prisma.salesToolData.deleteMany({ where: { key: GOAL_KEY } });
  }
  if (revenue !== null) {
    await prisma.salesToolData.upsert({
      where: { key: ACTUALS_KEY },
      create: { key: ACTUALS_KEY, value: JSON.stringify({ revenue, labor: 0 }) },
      update: { value: JSON.stringify({ revenue, labor: 0 }) },
    });
  } else {
    await prisma.salesToolData.deleteMany({ where: { key: ACTUALS_KEY } });
  }
}

// Scoped to the "This Month" section specifically — the portal layout's own
// persistent GoalProgressBar (src/components/GoalProgressBar.tsx) renders a
// similar "$X to go" text in the page header/nav on every page, which would
// otherwise collide with these lookups.
function thisMonthSection(page: Page) {
  return page.locator("section", { has: page.getByRole("heading", { name: "This Month" }) });
}

function monthlyGoalTile(page: Page) {
  return thisMonthSection(page).getByText("Monthly Goal", { exact: true }).locator("xpath=..");
}

test.describe.serial("Monthly Goal box shows its own progress text", () => {
  let originalGoal: { value: string } | null;
  let originalActuals: { value: string } | null;

  test.beforeAll(async () => {
    originalGoal = await prisma.salesToolData.findUnique({ where: { key: GOAL_KEY } });
    originalActuals = await prisma.salesToolData.findUnique({ where: { key: ACTUALS_KEY } });
  });

  test.afterAll(async () => {
    if (originalGoal) {
      await prisma.salesToolData.upsert({
        where: { key: GOAL_KEY },
        create: { key: GOAL_KEY, value: originalGoal.value },
        update: { value: originalGoal.value },
      });
    } else {
      await prisma.salesToolData.deleteMany({ where: { key: GOAL_KEY } });
    }
    if (originalActuals) {
      await prisma.salesToolData.upsert({
        where: { key: ACTUALS_KEY },
        create: { key: ACTUALS_KEY, value: originalActuals.value },
        update: { value: originalActuals.value },
      });
    } else {
      await prisma.salesToolData.deleteMany({ where: { key: ACTUALS_KEY } });
    }
    await prisma.$disconnect();
  });

  test("/sales: below goal shows '$X to go' inside the Monthly Goal box, not just the header badge", async ({
    page,
  }) => {
    await setGoalAndActuals(10000, 2000);
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales");

    const expectedText = `${money(8000)} to go`;
    const headerBadge = thisMonthSection(page).locator("span", { hasText: "to go" });
    await expect(headerBadge).toContainText(expectedText);
    await expect(monthlyGoalTile(page)).toContainText(expectedText);
  });

  test("/sales: at/above goal shows 'Goal hit!' inside the Monthly Goal box", async ({ page }) => {
    await setGoalAndActuals(10000, 15000);
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales");

    await expect(monthlyGoalTile(page)).toContainText("Goal hit!");
  });

  test("/sales: no goal set shows neither the header badge nor the in-box caption", async ({ page }) => {
    await setGoalAndActuals(0, 2000);
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales");

    await expect(thisMonthSection(page).getByText("to go", { exact: false })).toHaveCount(0);
    await expect(thisMonthSection(page).getByText("Goal hit", { exact: false })).toHaveCount(0);
    await expect(monthlyGoalTile(page)).toContainText("Not set");
  });

  test("Home: below goal shows '$X to hit this month's goal' inside the Monthly Goal box", async ({ page }) => {
    await setGoalAndActuals(10000, 2000);
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");

    const salesSection = page.locator("section", { has: page.getByRole("heading", { name: "Sales", exact: true }) });
    const expectedText = `${money(8000)} to hit this month's goal`;
    await expect(salesSection.locator("span", { hasText: "to hit this month's goal" })).toContainText(expectedText);
    await expect(
      salesSection.getByText("Monthly Goal", { exact: true }).locator("xpath=..")
    ).toContainText(expectedText);
  });

  test("Home: at/above goal shows 'Goal hit' inside the Monthly Goal box", async ({ page }) => {
    await setGoalAndActuals(10000, 15000);
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");

    const salesSection = page.locator("section", { has: page.getByRole("heading", { name: "Sales", exact: true }) });
    await expect(
      salesSection.getByText("Monthly Goal", { exact: true }).locator("xpath=..")
    ).toContainText("Goal hit");
  });

  test("Home: no goal set shows neither the header badge nor the in-box caption", async ({ page }) => {
    await setGoalAndActuals(0, 2000);
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/");

    const salesSection = page.locator("section", { has: page.getByRole("heading", { name: "Sales", exact: true }) });
    await expect(salesSection.getByText("to hit this month's goal", { exact: false })).toHaveCount(0);
    await expect(salesSection.getByText("Goal hit", { exact: false })).toHaveCount(0);
    await expect(salesSection.getByText("Monthly Goal", { exact: true }).locator("xpath=..")).toContainText(
      "Not set"
    );
  });
});
