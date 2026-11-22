import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Covers the Meta Pixel integration on the public lead form
// (src/components/MetaPixel.tsx, src/app/lead-form/*). Meta's own domains
// (connect.facebook.net, facebook.com) aren't reachable from this sandbox
// (confirmed: the egress proxy refuses them), so these tests spy on
// `window.fbq` directly via page.addInitScript — injected before any page
// script runs, this intercepts every fbq(...) call without depending on
// the real external script ever loading, which is exactly what matters
// for proving this app calls fbq correctly.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const RUN_ID = Date.now().toString();
const prisma = new PrismaClient();

async function installFbqSpy(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __fbqCalls: unknown[][] }).__fbqCalls = [];
    (window as unknown as { fbq: (...args: unknown[]) => void }).fbq = (...args: unknown[]) => {
      (window as unknown as { __fbqCalls: unknown[][] }).__fbqCalls.push(args);
    };
  });
}

async function getFbqCalls(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => (window as unknown as { __fbqCalls?: unknown[][] }).__fbqCalls ?? []);
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function fillRequiredFields(page: Page, overrides: { email: string; firstName?: string }) {
  await page.fill('input[name="firstName"]', overrides.firstName ?? "Pixel");
  await page.fill('input[name="lastName"]', `Test-${RUN_ID}`);
  await page.fill('input[name="email"]', overrides.email);
  await page.fill('input[name="phone"]', "5555550100");
  await page.fill('input[name="squareFootage"]', "1500");
  await page.selectOption('select[name="frequency"]', { index: 1 });
  await page.selectOption('select[name="howHeard"]', { index: 1 });
}

test.describe.serial("Meta Pixel on the public lead form", () => {
  test.afterAll(async () => {
    await prisma.lead.deleteMany({ where: { lastName: { contains: RUN_ID } } });
    await prisma.$disconnect();
  });

  test("PageView fires on /lead-form via fbq('init', <pixelId>) + fbq('track', 'PageView')", async ({ page }) => {
    await installFbqSpy(page);
    await page.goto("/lead-form");
    await page.waitForLoadState("networkidle");

    const calls = await getFbqCalls(page);
    expect(calls).toContainEqual(["init", "1409553047075047"]);
    expect(calls).toContainEqual(["track", "PageView"]);
  });

  test("UTM parameters are captured into hidden fields and saved on the created lead", async ({ page }) => {
    const email = `pixel-utm-${RUN_ID}@example.com`;
    await page.goto(
      "/lead-form?utm_source=facebook&utm_medium=cpc&utm_campaign=fall-promo&utm_content=ad-variant-1"
    );
    await page.waitForLoadState("networkidle");

    await expect(page.locator('input[name="utmSource"]')).toHaveValue("facebook");
    await expect(page.locator('input[name="utmMedium"]')).toHaveValue("cpc");
    await expect(page.locator('input[name="utmCampaign"]')).toHaveValue("fall-promo");
    await expect(page.locator('input[name="utmContent"]')).toHaveValue("ad-variant-1");

    await fillRequiredFields(page, { email });
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.includes("/thank-you"));

    const lead = await prisma.lead.findFirstOrThrow({ where: { email } });
    expect(lead.utmSource).toBe("facebook");
    expect(lead.utmMedium).toBe("cpc");
    expect(lead.utmCampaign).toBe("fall-promo");
    expect(lead.utmContent).toBe("ad-variant-1");
  });

  test("Lead event fires exactly once on a genuine new-lead submission, and never again on a reload of the same thank-you URL", async ({
    page,
  }) => {
    const email = `pixel-lead-${RUN_ID}@example.com`;
    await installFbqSpy(page);
    await page.goto("/lead-form");
    await page.waitForLoadState("networkidle");
    await fillRequiredFields(page, { email });
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.includes("/thank-you"));
    await page.waitForLoadState("networkidle");

    // The redirect target is the plain "/lead-form/thank-you" (no query
    // string) — several existing tests assert that exact URL. The marker
    // that tells the thank-you page a new lead was really saved is a
    // short-lived httpOnly cookie instead (see submitLeadAction); not
    // readable via page JS, but visible to the test framework itself.
    const cookies = await page.context().cookies();
    const marker = cookies.find((c) => c.name === "mcc_last_lead_id");
    expect(marker).toBeTruthy();
    expect(marker!.value.length).toBeGreaterThan(0);

    const firstLoadCalls = await getFbqCalls(page);
    const leadCalls = firstLoadCalls.filter((c) => c[0] === "track" && c[1] === "Lead");
    expect(leadCalls.length).toBe(1);
    expect(leadCalls[0]).toEqual(["track", "Lead"]); // bare event, no custom data object

    await installFbqSpy(page); // fresh spy + __fbqCalls for the reload
    await page.reload();
    await page.waitForLoadState("networkidle");

    const reloadCalls = await getFbqCalls(page);
    const reloadLeadCalls = reloadCalls.filter((c) => c[0] === "track" && c[1] === "Lead");
    expect(reloadLeadCalls.length).toBe(0); // deduped — same lead id, already fired
  });

  test("A duplicate submission from an already-active lead's email never fires the Lead event (no new lead was saved)", async ({
    page,
  }) => {
    const email = `pixel-duplicate-${RUN_ID}@example.com`;
    await prisma.lead.create({
      data: {
        firstName: "Existing",
        lastName: `Active-${RUN_ID}`,
        email,
        phone: "5555550199",
        stage: "NEW_INQUIRY",
      },
    });

    await installFbqSpy(page);
    await page.goto("/lead-form");
    await page.waitForLoadState("networkidle");
    await fillRequiredFields(page, { email, firstName: "DuplicateAttempt" });
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.includes("/thank-you"));
    await page.waitForLoadState("networkidle");

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "mcc_last_lead_id")).toBeUndefined();

    const calls = await getFbqCalls(page);
    const leadCalls = calls.filter((c) => c[0] === "track" && c[1] === "Lead");
    expect(leadCalls.length).toBe(0);

    const leadCount = await prisma.lead.count({ where: { email } });
    expect(leadCount).toBe(1); // still just the one pre-existing lead, no duplicate created
  });

  test("The Pixel never loads on the authenticated employee dashboard", async ({ page }) => {
    await installFbqSpy(page);
    // installFbqSpy's own injected window.fbq makes it impossible to tell
    // "real base script ran" from "nothing ran" by presence alone — check
    // instead that no init/PageView calls ever reached it, which only
    // happens if MetaPixel's base script never executed on this page.
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/sales");
    await page.waitForLoadState("networkidle");

    const calls = await getFbqCalls(page);
    expect(calls.length).toBe(0);
  });
});
