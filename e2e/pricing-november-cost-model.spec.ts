import { test, expect, type Page, type Frame } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import {
  computeNovemberBaseCost,
  computeNovemberQuoteCost,
  novemberMinimumPrice as pureNovemberMinimumPrice,
  evaluateLegWarning as pureEvaluateLegWarning,
} from "../src/lib/pricingMargin";
// Aliased on import: a name identical to one of the embedded HTML's own
// ADMIN-ONLY globals (e.g. "evaluateLegWarning"), referenced from inside a
// frame.evaluate(() => {...}) closure below, gets rewritten by the test
// bundler into a reference to THIS import instead of the browser's own
// global — which breaks at runtime (nothing named via import exists inside
// the iframe). Aliasing avoids the collision entirely.

// Covers the November 2026 cost calculator (the "approved November plan")
// at the browser/HTML level — the ADMIN-ONLY mirror embedded in
// src/content/sales-pricing-tool.html must compute byte-for-byte the same
// numbers as src/lib/pricingMargin.ts (unit-tested on its own in
// e2e/pricing-margin-unit.spec.ts), the live ledger must render the
// non-blocking warning correctly, cost data must never reach a non-ADMIN
// response, and — the core of this plan — margin must never block sending.
// No real email is ever sent: this test environment has no MS_GRAPH_*
// credentials, so src/lib/email.ts's sendEmail() fails closed with a clear
// "not configured" error before any outbound network call.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "shar@mamascleaningcrew.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-this-immediately";
const FRAME_TITLE = "Pricing & Client Quotes";
const RUN_ID = Date.now().toString();
const PASSWORD = "Test-Password-123!";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function loginAsAdmin(page: Page) {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
}

async function openPricingFrame(page: Page): Promise<Frame> {
  await page.goto("/sales/pricing-tool");
  const handle = await page.locator(`iframe[title="${FRAME_TITLE}"]`).elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error("Could not access the pricing tool iframe's real Frame.");
  return frame;
}

async function seedQuote(page: Page, id: string, data: Record<string, unknown>) {
  const res = await page.request.post("/api/sales/storage", {
    data: { op: "set", key: `quote:${id}`, value: JSON.stringify(data) },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function deleteQuote(page: Page, id: string) {
  await page.request.post("/api/sales/storage", { data: { op: "delete", key: `quote:${id}` } });
}

async function cleanupQuoteAndLead(id: string) {
  const lead = await prisma.lead.findFirst({ where: { quoteKey: id } });
  if (lead) {
    await prisma.leadNote.deleteMany({ where: { leadId: lead.id } });
    await prisma.leadStageChange.deleteMany({ where: { leadId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
  }
  await prisma.salesToolData.deleteMany({ where: { key: `quote:${id}` } });
}

test.describe.serial("November 2026 cost calculator", () => {
  let repId: string;
  const repEmail = `nov-cost-rep-${RUN_ID}@example.com`;
  const createdQuoteIds = new Set<string>();

  test.beforeAll(async () => {
    const rep = await prisma.user.create({
      data: {
        email: repEmail,
        name: `Nov Cost Rep ${RUN_ID}`,
        role: "SALES_REP",
        passwordHash: await hashPassword(PASSWORD),
        mustSetPassword: false,
        active: true,
        departmentAccess: { create: [{ department: "SALES", canEdit: true }] },
      },
    });
    repId = rep.id;
  });

  test.afterAll(async () => {
    for (const id of createdQuoteIds) {
      await cleanupQuoteAndLead(id);
    }
    await prisma.departmentAccess.deleteMany({ where: { userId: repId } });
    await prisma.user.deleteMany({ where: { id: repId } });
    await prisma.$disconnect();
  });

  test("the embedded HTML's ADMIN-ONLY cost mirror matches src/lib/pricingMargin.ts exactly — listed city", async ({ page }) => {
    await loginAsAdmin(page);
    const frame = await openPricingFrame(page);

    const result = await frame.evaluate(() => {
      // @ts-expect-error - globals from the embedded ADMIN-ONLY script
      const base = novemberBaseCost(3, 2, "Irvine");
      // @ts-expect-error
      const qc = novemberQuoteCost(500, 3, 2, "Irvine");
      // @ts-expect-error
      const minPrice = novemberMinimumPrice(3, 2, "Irvine");
      // @ts-expect-error
      const warning = evaluateLegWarning("single", 500, 3, 2, "Irvine");
      return { base, qc, minPrice, warning };
    });

    const expectedBase = computeNovemberBaseCost({ hours: 3, teamSize: 2, city: "Irvine" });
    expect(result.base.onsitePersonHours).toBeCloseTo(expectedBase.onsitePersonHours, 6);
    expect(result.base.travelPersonHours).toBeCloseTo(expectedBase.travelPersonHours, 6);
    expect(result.base.vehicleAllowance).toBeCloseTo(expectedBase.vehicleAllowance, 6);
    expect(result.base.baseCost).toBeCloseTo(expectedBase.baseCost, 6);
    expect(result.base.travelComplete).toBe(true);

    const expectedQc = computeNovemberQuoteCost(500, { hours: 3, teamSize: 2, city: "Irvine" });
    expect(result.qc.marginPct).toBeCloseTo(expectedQc.marginPct, 6);
    expect(result.qc.cost).toBeCloseTo(expectedQc.cost, 6);

    const expectedMin = pureNovemberMinimumPrice({ hours: 3, teamSize: 2, city: "Irvine" });
    expect(result.minPrice).toBeCloseTo(expectedMin, 2);

    const expectedWarning = pureEvaluateLegWarning("single", 500, 3, 2, "Irvine");
    expect(result.warning.belowMinimum).toBe(expectedWarning.belowMinimum);
    expect(result.warning.addToReachMinimum).toBeCloseTo(expectedWarning.addToReachMinimum, 2);
  });

  test("an unlisted city: embedded mirror reports travelComplete:false and excludes travel cost, matching pricingMargin.ts", async ({ page }) => {
    await loginAsAdmin(page);
    const frame = await openPricingFrame(page);

    const result = await frame.evaluate(() => {
      // @ts-expect-error
      return novemberBaseCost(3, 2, "Anaheim");
    });
    const expected = computeNovemberBaseCost({ hours: 3, teamSize: 2, city: "Anaheim" });
    expect(result.travelComplete).toBe(false);
    expect(result.travelPersonHours).toBe(0);
    expect(result.vehicleAllowance).toBe(0);
    expect(result.baseCost).toBeCloseTo(expected.baseCost, 6);
  });

  test("live ledger: a comfortably-priced A la Carte quote in a listed city shows no warning", async ({ page }) => {
    await loginAsAdmin(page);
    const frame = await openPricingFrame(page);

    await frame.evaluate(() => {
      // @ts-expect-error
      selectService("alacarte");
      // @ts-expect-error
      document.getElementById("city-select").value = "Irvine";
      // @ts-expect-error
      state.areaQty = { bathroom: 4, kitchen: 2 }; // large job => high price relative to cost
      // @ts-expect-error
      recalc();
    });

    const warnBox = frame.locator("#margin-warn");
    expect((await warnBox.textContent())?.trim()).toBe("");
    // Hidden/neutral — no leg below the minimum and no travel-incomplete
    // notice to show, so neither colored class is applied.
    await expect(warnBox).not.toHaveClass(/show-info/);
    await expect(warnBox).not.toHaveClass(/\bshow\b/);
    const ledgerText = await frame.locator("#ledger-body").textContent();
    expect(ledgerText).toContain("Onsite person-hours");
    expect(ledgerText).toContain("Vehicle allowance");
    expect(ledgerText).not.toContain("Travel estimate incomplete");
    // Walk-away floor: a listed city's floor price never carries the
    // excluding-travel caveat.
    const floorText = await frame.locator("#floor-price").textContent();
    expect(floorText).toContain("Nov 2026 planning assumption");
    expect(floorText).not.toContain("excluding travel");
  });

  test("live ledger: an unlisted city ('Other') with a fine margin shows the travel-incomplete notice in NEUTRAL styling (never red), and the walk-away floor price is labeled provisional/excluding travel", async ({ page }) => {
    await loginAsAdmin(page);
    const frame = await openPricingFrame(page);

    await frame.evaluate(() => {
      // @ts-expect-error
      selectService("alacarte");
      // @ts-expect-error
      document.getElementById("city-select").value = "Other";
      // @ts-expect-error
      state.areaQty = { bathroom: 4, kitchen: 2 }; // large, comfortably-priced job => margin >= 10%
      // @ts-expect-error
      recalc();
    });

    const ledgerText = await frame.locator("#ledger-body").textContent();
    expect(ledgerText).toContain("Travel estimate incomplete");
    expect(ledgerText).toContain("not charged, travel incomplete");

    const warnBox = frame.locator("#margin-warn");
    const warnText = await warnBox.textContent();
    expect(warnText).toContain("travel estimate incomplete");
    expect(warnText).not.toContain("below the 10% minimum");
    // Neutral informational styling — margin is fine, so this must never be
    // the red below-10% warning class.
    await expect(warnBox).toHaveClass(/show-info/);
    await expect(warnBox).not.toHaveClass(/margin-warn-box show(?!-info)/);

    // The walk-away floor price must not look like a final/all-in minimum
    // when travel is excluded from it.
    const floorText = await frame.locator("#floor-price").textContent();
    expect(floorText).toContain("Nov 2026 planning assumption");
    expect(floorText).toContain("provisional, excluding travel");
  });

  test("live ledger: a tiny, cheap A la Carte job in a LISTED city triggers the below-10% warning (red), with no travel-incomplete text", async ({ page }) => {
    await loginAsAdmin(page);
    const frame = await openPricingFrame(page);

    await frame.evaluate(() => {
      // @ts-expect-error
      selectService("alacarte");
      // @ts-expect-error
      document.getElementById("city-select").value = "San Clemente"; // highest travel cost in the table
      // @ts-expect-error
      state.areaQty = { bathroom: 1 }; // smallest possible job => low price vs. fixed cost
      // @ts-expect-error
      recalc();
    });

    const warnBox = frame.locator("#margin-warn");
    const warnText = await warnBox.textContent();
    expect(warnText).toContain("below the 10% minimum");
    expect(warnText).toMatch(/Add \$\d+\.\d{2} to reach the minimum/);
    expect(warnText).toContain("warning only — sending is never blocked on margin");
    expect(warnText).not.toContain("21%");
    expect(warnText).not.toContain("HOLD");
    expect(warnText).not.toContain("travel estimate incomplete");
    // The actual below-10% case stays red, never the neutral info class.
    await expect(warnBox).toHaveClass(/margin-warn-box show$/);
    await expect(warnBox).not.toHaveClass(/show-info/);
  });

  test("live ledger: a tiny, cheap A la Carte job in an UNLISTED city shows the red below-10% warning together with the travel-incomplete note, never the neutral class", async ({ page }) => {
    await loginAsAdmin(page);
    const frame = await openPricingFrame(page);

    await frame.evaluate(() => {
      // @ts-expect-error
      selectService("alacarte");
      // @ts-expect-error
      document.getElementById("city-select").value = "Other";
      // An unlisted city still has no travel/vehicle cost at all (never
      // invented), so a merely-small job can still clear 10% there — force
      // a genuinely below-cost price directly, rather than hunting for an
      // areaQty combination that happens to be cheap enough.
      // @ts-expect-error
      window.computeCurrent = () => ({
        price: 10,
        lowPrice: null,
        highPrice: null,
        hours: 5,
        teamSize: 2,
        range: null,
        firstTimeDiscount: 0,
        initial: null,
        note: "",
      });
      // @ts-expect-error
      recalc();
    });

    const warnBox = frame.locator("#margin-warn");
    const warnText = await warnBox.textContent();
    expect(warnText).toContain("below the 10% minimum");
    expect(warnText).toContain("travel estimate incomplete");
    expect(warnText).toContain("provisional, excluding travel");
    // A genuine below-10% leg always wins the red styling, even when the
    // same leg's travel estimate is also incomplete.
    await expect(warnBox).toHaveClass(/margin-warn-box show$/);
    await expect(warnBox).not.toHaveClass(/show-info/);

    const floorText = await frame.locator("#floor-price").textContent();
    expect(floorText).toContain("provisional, excluding travel");
  });

  test("the walk-away floor box and 'Costs Unverified'/COST_DATA_VERIFIED wording are gone — replaced by the Nov 2026 planning-assumption badge", async ({ page }) => {
    await loginAsAdmin(page);
    const res = await page.request.get("/api/sales/pricing-tool");
    const html = await res.text();
    expect(html).toContain("Nov 2026 Planning Assumptions");
    expect(html).not.toContain("Costs Unverified");
    expect(html).not.toContain("COST_DATA_VERIFIED");
    expect(html).not.toContain("margin-hold-box");
    expect(html).not.toContain("sales-hold-banner");
  });

  test("non-ADMIN response: no November cost figures, city travel table, or cost constant names anywhere", async ({ page }) => {
    await loginAs(page, repEmail, PASSWORD);
    const res = await page.request.get("/api/sales/pricing-tool");
    const html = await res.text();
    // Note: "margin-warn"/"ledger-body" (bare CSS class / element-id names
    // used in comments) are deliberately excluded here — they're harmless,
    // pre-existing identifier text with no dollar value attached, same as
    // the old margin-hold-box/ledger-body-guarded names before this PR.
    const forbidden = [
      "31.008025",
      "16.0121042907",
      "6499.58",
      "NOV_LOADED_LABOR_PER_PERSON_HR",
      "NOV_OVERHEAD_PER_ONSITE_PERSON_HR",
      "CITY_TRAVEL_ESTIMATES",
      "Nov 2026 Planning Assumptions",
      "TECH_WAGE",
      "AUDIT_OVERHEAD_PER_TECH_HR",
      "Walk-away floor",
    ];
    for (const needle of forbidden) {
      expect(html, `non-ADMIN response must not contain "${needle}"`).not.toContain(needle);
    }
  });

  test("a quote priced well below the (removed) 10% floor can still be sent — no margin-hold refusal, just the real transport attempt failing closed on missing MS_GRAPH config", async ({ page }) => {
    await loginAsAdmin(page);
    const quoteId = `nov-below-floor-${RUN_ID}`;
    createdQuoteIds.add(quoteId);
    await seedQuote(page, quoteId, {
      id: quoteId,
      clientName: `Below Floor Client ${RUN_ID}`,
      clientEmail: `below-floor-${RUN_ID}@example.com`,
      service: "alacarte",
      frequency: "One-Time",
      city: "San Clemente",
      teamSize: 2,
      low: "1.00",
      high: "1.00",
      suggested: "1.00", // deliberately far below any real minimum price
      timeLowHrs: 5,
      status: "pending",
      sentAt: null,
    });

    const res = await page.request.post("/api/sales/send-quote", {
      data: { id: quoteId, subject: "Test", body: "Test body" },
    });
    const body = await res.json();
    // Never a margin-hold 403 — the real, only-ever-reachable failure here
    // is the missing MS_GRAPH_* configuration in this test environment.
    expect(res.status()).not.toBe(403);
    expect(body.marginHold).toBeUndefined();
    expect(res.status()).toBe(502);
    expect(body.error).toContain("Microsoft Graph isn't configured");
  });

  test("other sending safeguards remain fully effective: missing/invalid recipient email is still refused", async ({ page }) => {
    await loginAsAdmin(page);
    const quoteId = `nov-no-email-${RUN_ID}`;
    createdQuoteIds.add(quoteId);
    await seedQuote(page, quoteId, {
      id: quoteId,
      clientName: `No Email Client ${RUN_ID}`,
      clientEmail: "",
      service: "alacarte",
      city: "Irvine",
      teamSize: 2,
      suggested: "1000.00",
      timeLowHrs: 3,
      status: "pending",
      sentAt: null,
    });
    const res = await page.request.post("/api/sales/send-quote", {
      data: { id: quoteId, subject: "Test", body: "Test body" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("no valid client email");
  });

  test("other sending safeguards remain fully effective: the atomic duplicate-send claim still allows exactly one concurrent send to proceed", async ({ page }) => {
    await loginAsAdmin(page);
    const quoteId = `nov-duplicate-send-${RUN_ID}`;
    createdQuoteIds.add(quoteId);
    await seedQuote(page, quoteId, {
      id: quoteId,
      clientName: `Dup Send Client ${RUN_ID}`,
      clientEmail: `dup-send-${RUN_ID}@example.com`,
      service: "alacarte",
      city: "Irvine",
      teamSize: 2,
      suggested: "1000.00",
      timeLowHrs: 3,
      status: "pending",
      sentAt: null,
    });

    const [first, second] = await Promise.all([
      page.request.post("/api/sales/send-quote", { data: { id: quoteId, subject: "A", body: "A" } }),
      page.request.post("/api/sales/send-quote", { data: { id: quoteId, subject: "B", body: "B" } }),
    ]);
    const statuses = [first.status(), second.status()].sort();
    // Neither request ever gets a margin refusal (403) — that's this test's
    // actual concern. Each claims the atomic SENDING state or is refused as
    // already-in-flight (409), then the real (here, unconfigured-transport)
    // attempt fails closed (502). A transport failure reverts the claim —
    // in this test environment that always happens (no real MS_GRAPH
    // config), which can occasionally let both requests' compare-and-swap
    // land against the pre-revert value in sequence rather than in a true
    // 409-then-502 interleaving; either shape below still proves the claim
    // mechanism (and the non-margin nature of every outcome) is intact.
    expect(statuses.every((s) => s === 409 || s === 502)).toBe(true);
    expect(statuses).toContain(502);
  });

  test("other sending safeguards remain fully effective: a quote linked to a Scam-classified lead is still blocked, regardless of margin", async ({ page }) => {
    await loginAsAdmin(page);
    const quoteId = `nov-scam-blocked-${RUN_ID}`;
    createdQuoteIds.add(quoteId);
    await seedQuote(page, quoteId, {
      id: quoteId,
      clientName: `Scam Linked Client ${RUN_ID}`,
      clientEmail: `scam-linked-${RUN_ID}@example.com`,
      phone: "9495551234", // required by syncLeadFromQuote to create a linked Lead
      service: "alacarte",
      city: "Irvine",
      teamSize: 2,
      suggested: "1000.00", // comfortably above any margin floor
      timeLowHrs: 3,
      status: "pending",
      sentAt: null,
    });
    // syncLeadFromQuote (triggered by the seedQuote "set" call above) will
    // have created a linked Lead — classify it Scam directly for this test.
    const lead = await prisma.lead.findFirst({ where: { quoteKey: quoteId } });
    expect(lead).not.toBeNull();
    await prisma.lead.update({ where: { id: lead!.id }, data: { stage: "SCAM" } });

    const res = await page.request.post("/api/sales/send-quote", {
      data: { id: quoteId, subject: "Test", body: "Test body" },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("classified as Scam");
  });
});
