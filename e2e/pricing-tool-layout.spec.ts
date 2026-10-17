import { test, expect, type Page } from "@playwright/test";

// Sales > Pricing & Client Quotes (/sales/pricing-tool) used to break out to
// the full browser width via `w-screen ml-[calc(-50vw+50%)]`, assuming its
// own column was centered in the viewport. That stopped being true once the
// portal layout added a persistent sidebar — the tool rendered partly
// underneath the sidebar and ran past the right edge of the screen on
// desktop. Filling the normal content column instead keeps it fully
// on-screen with no horizontal overflow, on both the desktop sidebar and the
// 390px mobile drawer layout.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe("Pricing tool layout", () => {
  test("Desktop: fits within the content column, no horizontal overflow, nothing cut off by the sidebar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsAdmin(page);
    await page.goto("/sales/pricing-tool");
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

    const box = await page.locator("iframe").boundingBox();
    expect(box).not.toBeNull();
    // The desktop sidebar is 256px wide — the tool must start clear of it...
    expect(box!.x).toBeGreaterThanOrEqual(256);
    // ...and its right edge must stay within the viewport.
    expect(box!.x + box!.width).toBeLessThanOrEqual(overflow.clientWidth);
  });

  test("Mobile 390px: fits with no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsAdmin(page);
    await page.goto("/sales/pricing-tool");
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

    const box = await page.locator("iframe").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
