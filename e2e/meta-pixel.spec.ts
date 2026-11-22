import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Covers the Meta Pixel integration on the public lead form
// (src/components/MetaPixel.tsx, src/app/lead-form/*) and the ad-tracking
// consent banner gating it (src/components/ConsentBanner.tsx,
// src/lib/consent.ts) — opt-in, not opt-out: nothing loads until a
// visitor explicitly accepts. Meta's own domains (connect.facebook.net,
// facebook.com) aren't reachable from this sandbox (confirmed: the egress
// proxy refuses them), so these tests spy on `window.fbq` directly via
// page.addInitScript — injected before any page script runs, this
// intercepts every fbq(...) call without depending on the real external
// script ever loading, which is exactly what matters for proving this app
// calls fbq correctly.
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

// Sets the ad-consent cookie directly, bypassing the banner UI — for
// tests whose actual subject is the Pixel/Lead-event logic, not the
// banner itself (that gets its own dedicated tests below).
async function grantAdConsentDirectly(page: Page) {
  await page.context().addCookies([
    {
      name: "mcc_ad_consent",
      value: "granted",
      url: "http://localhost:3000",
    },
  ]);
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

  test("With no consent decision yet, the Pixel never loads at all — opt-in, not opt-out", async ({ page }) => {
    await installFbqSpy(page);
    await page.goto("/lead-form");
    await page.waitForLoadState("networkidle");

    const calls = await getFbqCalls(page);
    expect(calls.length).toBe(0);
    await expect(page.locator("text=We use Meta (Facebook/Instagram) ad tracking")).toBeVisible();
  });

  test("Declining the consent banner keeps the Pixel off, dismisses the banner, and still lets the quote form work normally", async ({
    page,
  }) => {
    const email = `pixel-declined-${RUN_ID}@example.com`;
    await installFbqSpy(page);
    await page.goto("/lead-form");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Decline" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=We use Meta (Facebook/Instagram) ad tracking")).toHaveCount(0);

    const calls = await getFbqCalls(page);
    expect(calls.length).toBe(0); // still never loaded, even after the banner's own refresh

    // The quote form itself is completely unaffected by declining.
    await fillRequiredFields(page, { email });
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.includes("/thank-you"));
    const lead = await prisma.lead.findFirstOrThrow({ where: { email } });
    expect(lead.id).toBeTruthy();

    // No Lead event either, on the thank-you page, since consent was declined.
    const thankYouCalls = await getFbqCalls(page);
    expect(thankYouCalls.filter((c) => c[0] === "track" && c[1] === "Lead").length).toBe(0);

    // The decline choice persists — no banner, no tracking on a fresh visit.
    await installFbqSpy(page);
    await page.goto("/lead-form");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=We use Meta (Facebook/Instagram) ad tracking")).toHaveCount(0);
    expect((await getFbqCalls(page)).length).toBe(0);
  });

  test("Accepting the consent banner starts the Pixel immediately (PageView fires) and the choice persists", async ({
    page,
  }) => {
    await installFbqSpy(page);
    await page.goto("/lead-form");
    await page.waitForLoadState("networkidle");
    expect((await getFbqCalls(page)).length).toBe(0); // nothing yet, unanswered

    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.locator("text=We use Meta (Facebook/Instagram) ad tracking")).toHaveCount(0);

    // router.refresh() re-renders the server tree so <MetaPixel> now mounts
    // its <Script>, but that mount (and the script actually executing) lands
    // slightly after the refresh's own network activity settles — so poll
    // for the calls rather than relying on waitForLoadState.
    await expect.poll(async () => getFbqCalls(page)).toContainEqual(["init", "1409553047075047"]);
    const calls = await getFbqCalls(page);
    expect(calls).toContainEqual(["track", "PageView"]);

    // Persists on a fresh visit — no banner, Pixel active immediately.
    await installFbqSpy(page);
    await page.goto("/lead-form");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=We use Meta (Facebook/Instagram) ad tracking")).toHaveCount(0);
    const secondVisitCalls = await getFbqCalls(page);
    expect(secondVisitCalls).toContainEqual(["track", "PageView"]);
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

  test("Lead event fires exactly once on a genuine new-lead submission (consent granted), and never again on a reload of the same thank-you page", async ({
    page,
  }) => {
    const email = `pixel-lead-${RUN_ID}@example.com`;
    await grantAdConsentDirectly(page);
    await installFbqSpy(page);
    await page.goto("/lead-form");
    await page.waitForLoadState("networkidle");
    await fillRequiredFields(page, { email });
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.includes("/thank-you"));

    // The redirect target is the plain "/lead-form/thank-you" (no query
    // string) — several existing tests assert that exact URL. The marker
    // that tells the thank-you page a new lead was really saved is a
    // short-lived httpOnly cookie instead (see submitLeadAction); not
    // readable via page JS. MetaPixelLeadEvent consumes it via its own
    // client-side fetch, which resolves independently of page-load
    // network-idle, so poll for the Lead call itself rather than racing it.
    await expect
      .poll(async () => {
        const calls = await getFbqCalls(page);
        return calls.filter((c) => c[0] === "track" && c[1] === "Lead").length;
      })
      .toBe(1);

    const firstLoadCalls = await getFbqCalls(page);
    const leadCalls = firstLoadCalls.filter((c) => c[0] === "track" && c[1] === "Lead");
    expect(leadCalls.length).toBe(1);
    expect(leadCalls[0]).toEqual(["track", "Lead"]); // bare event, no custom data object

    // The Lead event could only have fired via the one-time consume route,
    // so by now the cookie must already be gone from the browser's jar.
    const cookiesAfterFire = await page.context().cookies();
    expect(cookiesAfterFire.find((c) => c.name === "mcc_last_lead_id")).toBeUndefined();

    await installFbqSpy(page); // fresh spy + __fbqCalls for the reload
    await page.reload();
    await page.waitForLoadState("networkidle");

    const reloadCalls = await getFbqCalls(page);
    const reloadLeadCalls = reloadCalls.filter((c) => c[0] === "track" && c[1] === "Lead");
    expect(reloadLeadCalls.length).toBe(0); // deduped — cookie already consumed, nothing to fire
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

    await grantAdConsentDirectly(page);
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
    await grantAdConsentDirectly(page);
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
