import { test, expect, type Page } from "@playwright/test";

// A regression safety net, not exhaustive coverage — these tests exist to
// catch "the build is broken" or "a whole section crashed" before it
// reaches production. They don't replace manually testing new features.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe("public pages (no login required)", () => {
  test("privacy policy is reachable", async ({ page }) => {
    const res = await page.goto("/legal/privacy-policy");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Privacy Policy");
  });

  test("terms are reachable", async ({ page }) => {
    const res = await page.goto("/legal/terms");
    expect(res?.status()).toBe(200);
  });

  test("careers page loads", async ({ page }) => {
    const res = await page.goto("/careers");
    expect(res?.status()).toBe(200);
  });

  test("unauthenticated request to /financials redirects to login", async ({ page }) => {
    await page.goto("/financials");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("admin smoke test", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("home page loads for admin", async ({ page }) => {
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("financials page loads", async ({ page }) => {
    await page.goto("/financials");
    await expect(page.locator("h1")).toContainText("Financials");
  });

  test("todo page loads and add-task works end to end", async ({ page }) => {
    await page.goto("/todo");
    await page.click('text="+ Add a task"');
    const taskName = `Smoke test task ${Date.now()}`;
    await page.fill('input[name="task"]', taskName);
    await page.click('button[type="submit"]:has-text("Add task")');
    await expect(page.locator("text=✓ Task added")).toBeVisible();
    await expect(page.locator(`text=${taskName}`)).toBeVisible();
  });

  test("staff directory loads", async ({ page }) => {
    const res = await page.goto("/staff");
    expect(res?.status()).toBe(200);
  });

  test("sales leads pipeline loads", async ({ page }) => {
    const res = await page.goto("/sales/leads");
    expect(res?.status()).toBe(200);
  });

  test("hr overview loads", async ({ page }) => {
    const res = await page.goto("/hr");
    expect(res?.status()).toBe(200);
  });

  test("recruiting applicants page loads", async ({ page }) => {
    const res = await page.goto("/recruiting/applicants");
    expect(res?.status()).toBe(200);
  });

  test("assistant page loads without crashing", async ({ page }) => {
    const res = await page.goto("/assistant");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("AI Assistant");
  });
});
