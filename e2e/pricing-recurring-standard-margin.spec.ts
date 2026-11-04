import { test, expect, type Page, type Frame } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { minAcceptablePrice, evaluateQuoteMarginHold } from "../src/lib/pricingMargin";

// Covers the pricing/quote tool's recurring-Standard pricing (Item 1), the
// Initial/Ongoing split (Item 2), its hourly-entry safeguards (Item 5), and
// the server-side 10% margin-hold enforcement (Item 3). Uses the same
// technique as the sibling claude/pricing-calculator-and-scam-classification
// branch's e2e tests: a FrameLocator can't run arbitrary script, but
// `iframe.elementHandle().contentFrame()` gives a real Frame whose
// `.evaluate()` calls the embedded script's own globals directly — this is
// how we both exercise the real arithmetic (not just scraped UI text) and
// prove the send-block holds even when the disabled Send button is
// bypassed. No real email is ever sent: this test environment has no
// MS_GRAPH_* credentials, so src/lib/email.ts's sendEmail() fails closed
// with a clear "not configured" error before any outbound network call —
// see e2e/send-email-transport.spec.ts, which already proves this.
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

async function getStoredQuote(page: Page, id: string): Promise<Record<string, unknown> | null> {
  const res = await page.request.post("/api/sales/storage", {
    data: { op: "get", key: `quote:${id}` },
  });
  if (res.status() === 404) return null;
  const body = await res.json();
  return JSON.parse(body.value);
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

test.describe.serial("Recurring Standard pricing + margin protection", () => {
  let repId: string;
  const repEmail = `recurring-std-rep-${RUN_ID}@example.com`;
  const createdQuoteIds = new Set<string>();

  test.beforeAll(async () => {
    const rep = await prisma.user.create({
      data: {
        email: repEmail,
        name: `Recurring Std Rep ${RUN_ID}`,
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

  // ── ITEM 1 ──────────────────────────────────────────────────────────────
  test("Item 1: recurring Standard uses $120/hr + new discount schedule; one-time Standard and every other service are byte-for-byte unchanged", async ({
    page,
  }) => {
    await loginAs(page, repEmail, PASSWORD);
    const frame = await openPricingFrame(page);

    // The isolated constant pair exists and is exactly as specified; the
    // OLD table/rate are untouched (still $150/hr team, still used by
    // one-time Standard and every other service).
    const constants = await frame.evaluate(() => ({
      // @ts-expect-error - globals from the embedded script
      teamRate: TEAM_RATE,
      // @ts-expect-error
      ratePerTech: RATE_PER_TECH,
      // @ts-expect-error
      freqDiscounts: FREQUENCY_DISCOUNTS,
      // @ts-expect-error
      recurringRate: RECURRING_STANDARD_TEAM_RATE,
      // @ts-expect-error
      recurringDiscounts: RECURRING_STANDARD_DISCOUNTS,
    }));
    expect(constants.teamRate).toBe(150);
    expect(constants.ratePerTech).toBe(75);
    expect(constants.freqDiscounts).toEqual({ onetime: 0, monthly: 0, triweekly: 0.05, biweekly: 0.1, weekly: 0.15 });
    expect(constants.recurringRate).toBe(120);
    expect(constants.recurringDiscounts).toEqual({ monthly: 0.05, triweekly: 0.1, biweekly: 0.15, weekly: 0.2 });

    // sqft=1800, moderate condition => baseHours = (1.14 + 1.8*0.63) * 1.25 = 2.8425
    // one-time:  max(200, 2.8425*150) * 1        = 426.375
    // monthly:   max(200, 2.8425*120) * (1-0.05) = 324.045
    // triweekly: max(200, 2.8425*120) * (1-0.10) = 306.99
    // biweekly:  max(200, 2.8425*120) * (1-0.15) = 289.935
    // weekly:    max(200, 2.8425*120) * (1-0.20) = 272.88
    const expected: Record<string, number> = {
      onetime: 426.375,
      monthly: 324.045,
      triweekly: 306.99,
      biweekly: 289.935,
      weekly: 272.88,
    };
    for (const [freq, expectedPrice] of Object.entries(expected)) {
      const price = await frame.evaluate((f) => {
        // @ts-expect-error
        state.service = "standard";
        // @ts-expect-error
        state.sqft = 1800;
        // @ts-expect-error
        state.condition = "moderate";
        // @ts-expect-error
        state.frequency = f;
        // @ts-expect-error
        state.addons = {};
        // @ts-expect-error
        state.glassDoors = 0;
        // @ts-expect-error
        return computeStandard().price;
      }, freq);
      expect(price, `frequency ${freq}`).toBeCloseTo(expectedPrice, 3);
    }

    // Every other service's own arithmetic is untouched — spot-check real
    // function calls (not just the shared constants above).
    const others = await frame.evaluate(() => {
      // @ts-expect-error
      state.areaQty = { bathroom: 2 };
      // @ts-expect-error
      const alacarte = computeAlaCarte(); // rawHours=1.0, corePrice=max(149,1.0*150)=150
      // @ts-expect-error
      state.condition = "light";
      // @ts-expect-error
      state.pcTeamSize = 2;
      // @ts-expect-error
      const deep = computeSpecialty("deep"); // heavyHours=4.88 => coreHours=4.88/1.5=3.2533.., rate=150
      return { alacarte: alacarte.price, deep: deep.price };
    });
    expect(others.alacarte).toBeCloseTo(150, 2);
    expect(others.deep).toBeCloseTo(Math.max(300, (4.88 / 1.5) * 150), 2);
  });

  // ── ITEM 2 ──────────────────────────────────────────────────────────────
  test("Item 2: Initial-leg $360 minimum / actual-hours billing, never discounted, consistent across every frequency", async ({
    page,
  }) => {
    await loginAs(page, repEmail, PASSWORD);
    const frame = await openPricingFrame(page);

    // The one hard numeric identity threaded through Items 1/2/3/5.
    const identity = await frame.evaluate(() => ({
      // @ts-expect-error
      minHours: INITIAL_CLEAN_MIN_HOURS,
      // @ts-expect-error
      rate: INITIAL_CLEAN_TEAM_RATE,
      // @ts-expect-error
      minimum: INITIAL_CLEAN_MINIMUM,
    }));
    expect(identity.minHours * identity.rate).toBe(360);
    expect(identity.minimum).toBe(360);
    expect(identity.rate).toBe(120);

    for (const freq of ["monthly", "triweekly", "biweekly", "weekly"]) {
      const result = await frame.evaluate((f) => {
        // @ts-expect-error
        state.service = "standard";
        // @ts-expect-error
        state.sqft = 1800;
        // @ts-expect-error
        state.condition = "moderate";
        // @ts-expect-error
        state.frequency = f;
        // @ts-expect-error
        state.addons = {};
        // @ts-expect-error
        state.glassDoors = 0;

        // below the 3-hr minimum — still bills the $360 floor
        // @ts-expect-error
        state.initialHoursIsOverride = true;
        // @ts-expect-error
        state.initialHoursOverride = 2;
        // @ts-expect-error
        const below = computeStandard().initial;

        // exactly at the minimum
        // @ts-expect-error
        state.initialHoursOverride = 3;
        // @ts-expect-error
        const atMin = computeStandard().initial;

        // beyond the minimum — bills actual hours * rate
        // @ts-expect-error
        state.initialHoursOverride = 5;
        // @ts-expect-error
        const above = computeStandard().initial;

        // no override — historical default (4 hrs)
        // @ts-expect-error
        state.initialHoursIsOverride = false;
        // @ts-expect-error
        state.initialHoursOverride = null;
        // @ts-expect-error
        const defaultLeg = computeStandard().initial;

        return { below, atMin, above, defaultLeg };
      }, freq);

      expect(result.below.estimatedCost, `${freq} below-min`).toBe(360);
      expect(result.atMin.estimatedCost, `${freq} at-min`).toBe(360);
      expect(result.above.estimatedCost, `${freq} above-min`).toBe(600); // 5 * 120
      expect(result.defaultLeg.estimatedCost, `${freq} default`).toBe(480); // 4 * 120
      expect(result.defaultLeg.isOverride, `${freq} default isOverride`).toBe(false);
    }

    // One-time Standard never gets an Initial leg at all.
    const oneTime = await frame.evaluate(() => {
      // @ts-expect-error
      state.frequency = "onetime";
      // @ts-expect-error
      return computeStandard().initial;
    });
    expect(oneTime).toBeUndefined();
  });

  // ── ITEM 5 ──────────────────────────────────────────────────────────────
  test("Item 5: hourly-entry safeguards — invalid input rejected, swap heuristic warns without silently correcting, confirmation gates save, override survives reopen", async ({
    page,
  }) => {
    await loginAs(page, repEmail, PASSWORD);
    const frame = await openPricingFrame(page);

    await frame.evaluate(() => {
      // @ts-expect-error
      selectService("standard");
      // @ts-expect-error
      setFrequency("weekly");
    });

    const hoursInput = frame.locator("#initial-hours-input");
    await expect(hoursInput).toHaveValue("4"); // historical default pre-filled

    // Invalid (zero / negative) is rejected — never silently accepted.
    await hoursInput.fill("0");
    await expect(frame.locator("#initial-hours-warning")).toContainText("Enter a positive number");
    let overrideState = await frame.evaluate(() => ({
      // @ts-expect-error
      override: state.initialHoursOverride,
      // @ts-expect-error
      isOverride: state.initialHoursIsOverride,
    }));
    expect(overrideState.isOverride).toBe(false); // the bad value never landed in state

    await hoursInput.fill("-5");
    await expect(frame.locator("#initial-hours-warning")).toContainText("Enter a positive number");

    // Likely-swapped entry (our stated heuristic: >24 hours for one visit,
    // more than 3 full 8-hour working days) — warned, but NOT silently
    // corrected: the value the rep typed is still the value in state.
    await hoursInput.fill("120");
    await expect(frame.locator("#initial-hours-warning")).toContainText("double-check");
    overrideState = await frame.evaluate(() => ({
      // @ts-expect-error
      override: state.initialHoursOverride,
      // @ts-expect-error
      isOverride: state.initialHoursIsOverride,
    }));
    expect(overrideState.override).toBe(120);
    expect(overrideState.isOverride).toBe(true);

    // A plausible override clears the warning.
    await hoursInput.fill("5.5");
    await expect(frame.locator("#initial-hours-warning")).toBeHidden();

    // Before SAVING, a confirmation summarizing hours/rate/total/client
    // wording is shown — cancelling aborts the save entirely.
    const clientName = `Hourly Safeguard Client ${RUN_ID}`;
    await frame.locator("#save-client-name").fill(clientName);
    await frame.locator("#save-client-email").fill(`hourly-safeguard-${RUN_ID}@example.com`);

    page.once("dialog", async (d) => {
      expect(d.message()).toContain("Hours: 5.5");
      expect(d.message()).toContain("Team rate: $120/hr");
      expect(d.message()).toContain("Estimated total: $660.00"); // 5.5 * 120
      await d.dismiss();
    });
    await frame.getByRole("button", { name: "Save / Email Quote →" }).click();
    await expect(frame.locator("#save-quote-status")).toContainText("Save cancelled");

    // Accepting the confirmation proceeds with the save.
    page.once("dialog", (d) => d.accept());
    await frame.getByRole("button", { name: "Save / Email Quote →" }).click();
    await expect(frame.locator("#save-quote-status")).toContainText("Saved", { timeout: 10_000 });
    const id = await frame.locator("#save-client-id").inputValue();
    createdQuoteIds.add(id);

    const stored = await getStoredQuote(page, id);
    expect(stored?.initialEstimatedHours).toBe(5.5);
    expect(stored?.initialIsOverride).toBe(true);
    expect(stored?.initialEstimatedCost).toBe(660);

    // Reopening (Pricing Calculator tab's own "Load for Walkthrough") must
    // retain the override exactly — not reset to the historical default.
    // Saving switched the active tab to "Client Quote" — switch back.
    await frame.locator("#tabbtn-pricing").click();
    await frame.locator("#pricing-load-id").fill(id);
    await frame.locator(".btn-load-walkthrough").click();
    await expect(frame.locator("#walkthrough-load-status")).toContainText("Loaded", { timeout: 10_000 });
    await expect(frame.locator("#initial-hours-input")).toHaveValue("5.5");
    const reopenedState = await frame.evaluate(() => ({
      // @ts-expect-error
      override: state.initialHoursOverride,
      // @ts-expect-error
      isOverride: state.initialHoursIsOverride,
    }));
    expect(reopenedState.override).toBe(5.5);
    expect(reopenedState.isOverride).toBe(true);
  });

  // ── ITEM 2 (save/reopen/client-preview + email body) ───────────────────
  test("Item 2: Initial/Ongoing sections survive save -> reopen -> client render -> email body; legacy quotes fall back cleanly", async ({
    page,
  }) => {
    await loginAs(page, repEmail, PASSWORD);
    const frame = await openPricingFrame(page);

    await frame.evaluate(() => {
      // @ts-expect-error
      selectService("standard");
      // @ts-expect-error
      state.sqft = 1800;
      // @ts-expect-error
      state.condition = "moderate";
      // @ts-expect-error
      setFrequency("biweekly");
    });
    const clientName = `Split Quote Client ${RUN_ID}`;
    const clientEmail = `split-quote-${RUN_ID}@example.com`;
    await frame.locator("#save-client-name").fill(clientName);
    await frame.locator("#save-client-email").fill(clientEmail);

    // Live Client-Facing Estimate panel shows the Initial section.
    await expect(frame.locator("#cv-initial-box")).toBeVisible();
    await expect(frame.locator("#cv-initial-price")).toContainText("$480"); // 4 hrs default * 120

    page.once("dialog", (d) => d.accept());
    await frame.getByRole("button", { name: "Save / Email Quote →" }).click();
    await expect(frame.locator("#save-quote-status")).toContainText("Saved", { timeout: 10_000 });
    const id = await frame.locator("#save-client-id").inputValue();
    createdQuoteIds.add(id);

    // Saving switches to the Client Quote tab and renders both cards.
    await expect(frame.locator("#q-price-eyebrow")).toContainText("Initial Cleaning", { timeout: 10_000 });
    await expect(frame.locator("#q-ongoing-card")).toBeVisible();
    await expect(frame.locator("#q-ongoing-price")).not.toBeEmpty();

    // Intercept the send-quote call to inspect the actual composed email
    // body's text, without needing (or wanting) a real send.
    let captured: { subject: string; body: string } | null = null;
    await page.route("**/api/sales/send-quote", async (route) => {
      captured = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, sentAt: new Date().toISOString() } });
    });
    // Recurring-Standard quote — sendQuoteToClient() shows the Item 5
    // pre-send confirmation first; accept it to proceed.
    page.once("dialog", (d) => d.accept());
    await frame.evaluate(() => {
      // @ts-expect-error
      sendQuoteToClient();
    });
    await expect.poll(() => captured !== null, { timeout: 10_000 }).toBe(true);
    expect(captured!.body).toContain("Initial Cleaning (estimate");
    expect(captured!.body).toContain("Ongoing Cleaning (Bi-Weekly)");
    expect(captured!.body).toContain("does not guarantee the job's actual-time profitability");
    await page.unroute("**/api/sales/send-quote");

    // Reopening in the Pricing Calculator tab repopulates both sections.
    await frame.locator("#tabbtn-pricing").click();
    await frame.locator("#pricing-load-id").fill(id);
    await frame.locator(".btn-load-walkthrough").click();
    await expect(frame.locator("#walkthrough-load-status")).toContainText("Loaded", { timeout: 10_000 });
    await expect(frame.locator("#cv-initial-box")).toBeVisible();

    // A legacy quote (saved before this PR, with none of the new fields)
    // falls back to the single-card behavior — never a synthesized value.
    const legacyId = `legacy-standard-${RUN_ID}`;
    createdQuoteIds.add(legacyId);
    await seedQuote(page, legacyId, {
      clientName: `Legacy Client ${RUN_ID}`,
      id: legacyId,
      clientEmail: `legacy-${RUN_ID}@example.com`,
      city: "Irvine",
      service: "standard",
      frequency: "Weekly",
      low: "250.00",
      high: "250.00",
      suggested: "250.00",
      timeLowHrs: 2,
      status: "pending",
      sentAt: null,
    });
    await frame.locator("#tabbtn-quote").click();
    const builderToggle = frame.locator("#builder-toggle-btn");
    if ((await builderToggle.textContent())?.includes("Open")) {
      await builderToggle.click();
    }
    await frame.locator("#load-id").fill(legacyId);
    await frame.getByRole("button", { name: "Load", exact: true }).click();
    await expect(frame.locator("#q-price-eyebrow")).toContainText("Your Quote", { timeout: 10_000 });
    await expect(frame.locator("#q-ongoing-card")).toBeHidden();
  });

  // ── ITEM 3 ──────────────────────────────────────────────────────────────
  test.describe("Item 3: 10% margin-hold is computed and enforced server-side", () => {
    test("storage 'set' persists a boolean marginHold; ADMIN gets the specific reason, a non-ADMIN Sales viewer does not", async ({
      page,
    }) => {
      await loginAsAdmin(page);
      const heldId = `margin-hold-admin-${RUN_ID}`;
      createdQuoteIds.add(heldId);
      const heldQuote = {
        clientName: `Margin Hold Admin ${RUN_ID}`,
        id: heldId,
        clientEmail: `margin-hold-admin-${RUN_ID}@example.com`,
        city: "Irvine",
        service: "standard",
        frequency: "Weekly",
        teamSize: 2,
        low: "10.00",
        high: "10.00",
        suggested: "10.00", // implausibly cheap for 5 hrs of team-of-2 labor — guaranteed held
        timeLowHrs: 5,
        initialEstimatedHours: 4,
        initialEstimatedCost: 10,
        initialMinimumHours: 3,
        status: "pending",
        sentAt: null,
      };
      const adminResult = await seedQuote(page, heldId, heldQuote);
      expect(adminResult.marginHold).toBe(true);
      expect(typeof adminResult.marginHoldReason).toBe("string");
      // Correction round (Item 1): a recurring Standard quote is now held
      // for the "unverified-cost" reason (unconditional, while
      // COST_DATA_VERIFIED is false) BEFORE the genuine-margin check even
      // matters — this fixture happens to also be genuinely below the 10%
      // floor, but that's no longer what the reason text leads with.
      expect(adminResult.marginHoldReason).toMatch(/provisional/i);
      expect(adminResult.marginHoldReason).toMatch(/not yet been reconciled|unreconciled/i);
      expect(adminResult.marginHoldReason).toMatch(/\$\d/);

      const persisted = await getStoredQuote(page, heldId);
      expect(persisted?.marginHold).toBe(true);

      // A non-ADMIN Sales viewer re-saving the SAME quote sees the boolean
      // but never the dollar-figure reason.
      const repPage = page; // same session reused below after re-login as rep
      await loginAs(repPage, repEmail, PASSWORD);
      const repResult = await seedQuote(repPage, heldId, heldQuote);
      expect(repResult.marginHold).toBe(true);
      expect(repResult.marginHoldReason).toBeUndefined();
    });

    test("send-quote refuses a held quote fresh, server-side — ADMIN sees the specific reason/floor, non-ADMIN sees only the generic message", async ({
      page,
    }) => {
      const heldId = `margin-hold-send-${RUN_ID}`;
      createdQuoteIds.add(heldId);
      const heldQuote = {
        clientName: `Margin Hold Send ${RUN_ID}`,
        id: heldId,
        clientEmail: `margin-hold-send-${RUN_ID}@example.com`,
        city: "Irvine",
        service: "standard",
        frequency: "Weekly",
        teamSize: 2,
        low: "10.00",
        high: "10.00",
        suggested: "10.00",
        timeLowHrs: 5,
        initialEstimatedHours: 4,
        initialEstimatedCost: 10,
        initialMinimumHours: 3,
        status: "pending",
        sentAt: null,
      };

      // This is a recurring-Standard quote, so sendQuoteToClient() itself
      // first shows the Item 5 pre-send confirmation (hours/rate/total) —
      // accept it so the call proceeds to the actual margin check/fetch.
      page.on("dialog", (d) => d.accept());

      // ADMIN: bypass the disabled Send button entirely by calling the
      // embedded script's own sendQuoteToClient() directly inside the real
      // Frame — proves the function's own server-side guard refuses, not
      // just that the button looked disabled.
      await loginAsAdmin(page);
      await seedQuote(page, heldId, heldQuote);
      const adminFrame = await openPricingFrame(page);
      await adminFrame.evaluate((data) => {
        // @ts-expect-error
        renderQuote(data);
      }, heldQuote);
      await adminFrame.evaluate(() => {
        // @ts-expect-error
        return sendQuoteToClient();
      });
      const adminStatus = await adminFrame.locator("#sc-send-status").textContent();
      // Correction round (Item 1): this recurring-Standard quote is held
      // for the unconditional "unverified-cost" reason now, not necessarily
      // a genuine below-the-floor margin — the refusal text is picked to
      // match what's actually held (see send-quote/route.ts).
      expect(adminStatus).toContain("Held.");
      expect(adminStatus).toMatch(/provisional/i);
      expect(adminStatus).toMatch(/\$\d/);
      expect(await adminFrame.locator("#sc-send-btn").isDisabled()).toBe(true);

      // Non-ADMIN Sales Rep: same refusal, generic message only, never a
      // dollar figure.
      await loginAs(page, repEmail, PASSWORD);
      const repFrame = await openPricingFrame(page);
      await repFrame.evaluate((data) => {
        // @ts-expect-error
        renderQuote(data);
      }, heldQuote);
      await repFrame.evaluate(() => {
        // @ts-expect-error
        return sendQuoteToClient();
      });
      const repStatus = await repFrame.locator("#sc-send-status").textContent();
      expect(repStatus).toContain("This quote needs owner review before it can be sent.");
      expect(repStatus).not.toMatch(/\$\d/);
      expect(repStatus).not.toContain("margin floor");
    });

    test("a NOT-held quote clears the margin check and proceeds to the real send attempt (which fails closed on missing MS_GRAPH config, not on margin)", async ({
      page,
    }) => {
      const okId = `margin-ok-send-${RUN_ID}`;
      createdQuoteIds.add(okId);
      await loginAsAdmin(page);
      const okQuote = {
        clientName: `Margin OK ${RUN_ID}`,
        id: okId,
        clientEmail: `margin-ok-${RUN_ID}@example.com`,
        city: "Irvine",
        service: "alacarte",
        frequency: "One-Time",
        teamSize: 2,
        low: "100000.00",
        high: "100000.00",
        suggested: "100000.00", // absurdly profitable — guaranteed to clear 10%
        timeLowHrs: 2,
        status: "pending",
        sentAt: null,
      };
      await seedQuote(page, okId, okQuote);
      const frame = await openPricingFrame(page);
      await frame.evaluate((data) => {
        // @ts-expect-error
        renderQuote(data);
      }, okQuote);
      await frame.evaluate(() => {
        // @ts-expect-error
        return sendQuoteToClient();
      });
      const status = await frame.locator("#sc-send-status").textContent();
      expect(status).not.toContain("margin floor");
      expect(status).not.toContain("owner review");
      expect(status).toContain("Microsoft Graph isn't configured");
    });

    test("exactly-10% boundary and the low-end-of-range check are honored the same way through the real save path", async ({
      page,
    }) => {
      // This exercises the SAME evaluateQuoteMarginHold() the routes call —
      // see e2e/pricing-margin-unit.spec.ts for the module-level pinned
      // boundary tests; this proves the storage route wires it up the same
      // way for a real saved quote shape.
      await loginAsAdmin(page);
      const id = `margin-lowend-${RUN_ID}`;
      createdQuoteIds.add(id);
      // teamSize 2, 3 hrs, Irvine, alacarte: comfortably-above-floor
      // suggested price, but a low end that undercuts the floor.
      const quote = {
        clientName: `Margin Lowend ${RUN_ID}`,
        id,
        clientEmail: `margin-lowend-${RUN_ID}@example.com`,
        city: "Irvine",
        service: "alacarte",
        frequency: "One-Time",
        teamSize: 2,
        timeLowHrs: 3,
        suggested: "900.00", // clears 10% easily
        low: "50.00", // nowhere near enough to clear 10% at the same hours
        high: "1080.00",
        status: "pending",
        sentAt: null,
      };
      const result = await seedQuote(page, id, quote);
      expect(result.marginHold).toBe(true); // held on the low end alone
      expect(result.marginHoldReason).toMatch(/below the 10% floor/);
    });
  });

  // ── CORRECTION ROUND ────────────────────────────────────────────────────
  // Covers the 4 corrections made to the above in a follow-up pass: (1) an
  // unconditional "unverified-cost" hold for every recurring Standard quote
  // while COST_DATA_VERIFIED is false, regardless of its real computed
  // margin; (2) the read path (GET / reopen) recomputing marginHold fresh,
  // not just save/send; (3) the Ongoing leg's price being a flat number
  // everywhere, never a ±20% range; (4) the first-time-client discount
  // never applying to recurring Standard's Ongoing (or Initial) leg.

  test.describe("Correction round — Item 1: unconditional unverified-cost hold", () => {
    test("a generously-priced recurring Standard quote (provisional margin well above 21% on both legs) is still held on save, and refused on send for both roles", async ({
      page,
    }) => {
      const id = `unverified-hold-${RUN_ID}`;
      createdQuoteIds.add(id);
      const city = "Irvine";
      const floorInit = minAcceptablePrice(4, 2, 21, city, "standard")!;
      const floorOngoing = minAcceptablePrice(1.5, 2, 21, city, "standard")!;
      const quote = {
        clientName: `Unverified Hold ${RUN_ID}`,
        id,
        clientEmail: `unverified-hold-${RUN_ID}@example.com`,
        city,
        service: "standard",
        frequency: "Weekly",
        teamSize: 2,
        initialEstimatedHours: 4,
        initialEstimatedCost: Number((floorInit * 3).toFixed(2)),
        initialMinimumHours: 3,
        timeLowHrs: 1.5,
        suggested: (floorOngoing * 3).toFixed(2),
        low: (floorOngoing * 3).toFixed(2),
        high: (floorOngoing * 3).toFixed(2),
        status: "pending",
        sentAt: null,
      };

      // Confirm, directly against the module, that this fixture's
      // PROVISIONAL margin is genuinely well above 21% on BOTH legs under
      // the pre-correction (verified-cost) logic — the point of this test
      // is that it's held anyway, not that it's secretly cheap.
      const verifiedOverride = evaluateQuoteMarginHold(quote, { costDataVerified: true });
      expect(verifiedOverride.held).toBe(false);
      for (const leg of verifiedOverride.legs) expect(leg.marginPct).toBeGreaterThan(21);

      await loginAsAdmin(page);
      const saveResult = await seedQuote(page, id, quote);
      expect(saveResult.marginHold).toBe(true);
      expect(saveResult.marginHoldReason).toMatch(/provisional/i);

      page.on("dialog", (d) => d.accept()); // Item 5 pre-send confirmation, every time

      const adminFrame = await openPricingFrame(page);
      await adminFrame.evaluate((data) => {
        // @ts-expect-error
        renderQuote(data);
      }, quote);
      await adminFrame.evaluate(() => {
        // @ts-expect-error
        return sendQuoteToClient();
      });
      const adminStatus = await adminFrame.locator("#sc-send-status").textContent();
      expect(adminStatus).toMatch(/provisional/i);
      expect(adminStatus).toMatch(/not yet been reconciled|unreconciled/i);
      expect(adminStatus).toMatch(/\$\d/);

      await loginAs(page, repEmail, PASSWORD);
      const repFrame = await openPricingFrame(page);
      await repFrame.evaluate((data) => {
        // @ts-expect-error
        renderQuote(data);
      }, quote);
      await repFrame.evaluate(() => {
        // @ts-expect-error
        return sendQuoteToClient();
      });
      const repStatus = await repFrame.locator("#sc-send-status").textContent();
      expect(repStatus).toContain("This quote needs owner review before it can be sent.");
      expect(repStatus).not.toMatch(/\$\d/);
      expect(repStatus).not.toMatch(/provisional/i);
      expect(repStatus).not.toMatch(/unverified|unreconciled/i);
      expect(repStatus).not.toContain("20.52");
    });
  });

  test.describe("Correction round — Item 2: reopen recomputes the margin hold fresh via the real GET path", () => {
    test("recurring Standard: a stale stored marginHold:false is recomputed to true on GET, and the row itself is never rewritten", async ({
      page,
    }) => {
      await loginAsAdmin(page);
      const id = `reopen-recompute-standard-${RUN_ID}`;
      createdQuoteIds.add(id);
      const city = "Irvine";
      const floorInit = minAcceptablePrice(4, 2, 21, city, "standard")!;
      const floorOngoing = minAcceptablePrice(1.5, 2, 21, city, "standard")!;
      const staleData = {
        clientName: `Reopen Recompute Standard ${RUN_ID}`,
        id,
        clientEmail: `reopen-recompute-standard-${RUN_ID}@example.com`,
        city,
        service: "standard",
        frequency: "Weekly",
        teamSize: 2,
        initialEstimatedHours: 4,
        initialEstimatedCost: Number((floorInit * 3).toFixed(2)), // genuinely high provisional margin
        initialMinimumHours: 3,
        timeLowHrs: 1.5,
        suggested: (floorOngoing * 3).toFixed(2),
        low: (floorOngoing * 3).toFixed(2),
        high: (floorOngoing * 3).toFixed(2),
        status: "pending",
        sentAt: null,
        marginHold: false, // deliberately stale — bypasses the "set" route, which would itself recompute this
      };
      await prisma.salesToolData.upsert({
        where: { key: `quote:${id}` },
        create: { key: `quote:${id}`, value: JSON.stringify(staleData) },
        update: { value: JSON.stringify(staleData) },
      });

      const before = await getStoredQuote(page, id);
      expect(before?.marginHold).toBe(false); // the stale value, exactly as seeded

      const freshRes = await page.request.post("/api/sales/storage", { data: { op: "get", key: `quote:${id}` } });
      const freshBody = await freshRes.json();
      expect(freshBody.marginHold).toBe(true); // recomputed fresh — unconditional hold (Correction round Item 1)

      const after = await getStoredQuote(page, id);
      expect(after?.marginHold).toBe(false); // the row itself was never rewritten by the GET
    });

    test("A la Carte (non-recurring-Standard): a stale stored marginHold:true is recomputed to false on GET when its current fields clear 10% fresh", async ({
      page,
    }) => {
      await loginAsAdmin(page);
      const id = `reopen-recompute-alacarte-${RUN_ID}`;
      createdQuoteIds.add(id);
      const floor = minAcceptablePrice(2, 2, 10, "Tustin", "alacarte")!;
      const staleData = {
        clientName: `Reopen Recompute Alacarte ${RUN_ID}`,
        id,
        clientEmail: `reopen-recompute-alacarte-${RUN_ID}@example.com`,
        city: "Tustin",
        service: "alacarte",
        frequency: "One-Time",
        teamSize: 2,
        timeLowHrs: 2,
        suggested: (floor * 5).toFixed(2),
        low: (floor * 5).toFixed(2),
        high: (floor * 5).toFixed(2),
        status: "pending",
        sentAt: null,
        marginHold: true, // deliberately stale
      };
      await prisma.salesToolData.upsert({
        where: { key: `quote:${id}` },
        create: { key: `quote:${id}`, value: JSON.stringify(staleData) },
        update: { value: JSON.stringify(staleData) },
      });

      const before = await getStoredQuote(page, id);
      expect(before?.marginHold).toBe(true); // the stale value, exactly as seeded

      const freshRes = await page.request.post("/api/sales/storage", { data: { op: "get", key: `quote:${id}` } });
      const freshBody = await freshRes.json();
      expect(freshBody.marginHold).toBe(false); // recomputed fresh — genuinely clears 10%, untouched by Item 1's correction

      const after = await getStoredQuote(page, id);
      expect(after?.marginHold).toBe(true); // the row itself was never rewritten by the GET
    });
  });

  test.describe("Correction round — Item 3: the flat ongoing price matches everywhere", () => {
    test("the same dollar amount appears in the live calculator, the saved quoteData (low=high=suggested), the client-facing render, and the composed email body", async ({
      page,
    }) => {
      await loginAs(page, repEmail, PASSWORD);
      const frame = await openPricingFrame(page);
      await frame.evaluate(() => {
        // @ts-expect-error
        selectService("standard");
        // @ts-expect-error
        state.sqft = 1800;
        // @ts-expect-error
        state.condition = "moderate";
        // @ts-expect-error
        setFrequency("monthly");
      });

      const cvPriceText = await frame.locator("#cv-price").textContent();
      // Flat — a single number, never a "$X–$Y" range, for the Ongoing price.
      expect(cvPriceText).toMatch(/^\$\d+\.\d{2}$/);

      const clientName = `Flat Price Client ${RUN_ID}`;
      await frame.locator("#save-client-name").fill(clientName);
      await frame.locator("#save-client-email").fill(`flat-price-${RUN_ID}@example.com`);
      page.once("dialog", (d) => d.accept()); // Item 5 pre-save confirmation
      await frame.getByRole("button", { name: "Save / Email Quote →" }).click();
      await expect(frame.locator("#save-quote-status")).toContainText("Saved", { timeout: 10_000 });
      const id = await frame.locator("#save-client-id").inputValue();
      createdQuoteIds.add(id);

      const stored = await getStoredQuote(page, id);
      expect(stored?.low).toBe(stored?.high);
      expect(stored?.low).toBe(stored?.suggested);
      const dollarAmount = Number(stored?.suggested);
      expect(dollarAmount).toBeGreaterThan(0);
      expect(cvPriceText).toBe(`$${dollarAmount.toFixed(2)}`);

      // Client-facing render's Ongoing price card.
      await expect(frame.locator("#q-ongoing-price")).toHaveText(`$${dollarAmount.toFixed(0)}`);

      // Composed email body's "Ongoing Cleaning" line — intercepted so
      // nothing is actually sent.
      let captured: { subject: string; body: string } | null = null;
      await page.route("**/api/sales/send-quote", async (route) => {
        captured = route.request().postDataJSON();
        await route.fulfill({ json: { ok: true, sentAt: new Date().toISOString() } });
      });
      page.once("dialog", (d) => d.accept()); // Item 5 pre-send confirmation
      await frame.evaluate(() => {
        // @ts-expect-error
        sendQuoteToClient();
      });
      await expect.poll(() => captured !== null, { timeout: 10_000 }).toBe(true);
      expect(captured!.body).toContain(`Ongoing Cleaning (Monthly): $${dollarAmount.toFixed(2)} flat rate`);
      await page.unroute("**/api/sales/send-quote");
    });
  });

  test.describe("Correction round — Item 4: the first-time-client discount is inert for recurring Standard", () => {
    test("checking first-time-client changes neither the Initial nor the Ongoing leg's price at any recurring frequency, and the chip never renders", async ({
      page,
    }) => {
      await loginAsAdmin(page);
      const frame = await openPricingFrame(page);

      for (const freq of ["monthly", "triweekly", "biweekly", "weekly"]) {
        const result = await frame.evaluate((f) => {
          // @ts-expect-error
          selectService("standard");
          // @ts-expect-error
          state.sqft = 1800;
          // @ts-expect-error
          state.condition = "moderate";
          // @ts-expect-error
          setFrequency(f);
          // @ts-expect-error
          const unchecked = computeCurrent();
          const checkbox = document.getElementById("first-time-client") as HTMLInputElement | null;
          if (checkbox) checkbox.checked = true;
          // @ts-expect-error
          const checked = computeCurrent();
          if (checkbox) checkbox.checked = false;
          return {
            hasCheckbox: !!checkbox,
            uncheckedPrice: unchecked.price,
            checkedPrice: checked.price,
            uncheckedInitial: unchecked.initial ? unchecked.initial.estimatedCost : null,
            checkedInitial: checked.initial ? checked.initial.estimatedCost : null,
            checkedFirstTimeDiscount: checked.firstTimeDiscount,
          };
        }, freq);
        expect(result.hasCheckbox, `${freq}: first-time-client checkbox exists`).toBe(true);
        expect(result.checkedPrice, `${freq}: ongoing price unaffected`).toBeCloseTo(result.uncheckedPrice, 6);
        expect(result.checkedInitial, `${freq}: initial cost unaffected`).toBeCloseTo(result.uncheckedInitial!, 6);
        expect(result.checkedFirstTimeDiscount, `${freq}: firstTimeDiscount reports 0`).toBe(0);
      }

      // The "First-Time -20%" chip never renders for a recurring Standard
      // quote, even with the checkbox checked.
      await frame.evaluate(() => {
        // @ts-expect-error
        selectService("standard");
        // @ts-expect-error
        setFrequency("weekly");
        const checkbox = document.getElementById("first-time-client") as HTMLInputElement | null;
        if (checkbox) checkbox.checked = true;
        // @ts-expect-error
        recalc();
      });
      await expect(frame.locator("#cv-chips")).not.toContainText("First-Time");
      await frame.evaluate(() => {
        const checkbox = document.getElementById("first-time-client") as HTMLInputElement | null;
        if (checkbox) checkbox.checked = false;
      });
    });

    test("one-time Standard and A la Carte still get the full 20% first-time discount applied exactly as before this correction", async ({
      page,
    }) => {
      await loginAsAdmin(page);
      const frame = await openPricingFrame(page);

      const oneTimeStandard = await frame.evaluate(() => {
        // @ts-expect-error
        selectService("standard");
        // @ts-expect-error
        state.sqft = 1800;
        // @ts-expect-error
        state.condition = "moderate";
        // @ts-expect-error
        setFrequency("onetime");
        // @ts-expect-error
        const unchecked = computeCurrent();
        const checkbox = document.getElementById("first-time-client") as HTMLInputElement | null;
        if (checkbox) checkbox.checked = true;
        // @ts-expect-error
        const checked = computeCurrent();
        if (checkbox) checkbox.checked = false;
        return { unchecked: unchecked.price, checked: checked.price, discount: checked.firstTimeDiscount };
      });
      expect(oneTimeStandard.discount).toBeCloseTo(0.2, 6);
      expect(oneTimeStandard.checked).toBeCloseTo(oneTimeStandard.unchecked * 0.8, 6);

      const alacarte = await frame.evaluate(() => {
        // @ts-expect-error
        selectService("alacarte");
        // @ts-expect-error
        state.areaQty = { bathroom: 2 };
        // @ts-expect-error
        const unchecked = computeCurrent();
        const checkbox = document.getElementById("first-time-client") as HTMLInputElement | null;
        if (checkbox) checkbox.checked = true;
        // @ts-expect-error
        const checked = computeCurrent();
        if (checkbox) checkbox.checked = false;
        return { unchecked: unchecked.price, checked: checked.price, discount: checked.firstTimeDiscount };
      });
      expect(alacarte.discount).toBeCloseTo(0.2, 6);
      expect(alacarte.checked).toBeCloseTo(alacarte.unchecked * 0.8, 6);
    });
  });

  test.describe("Correction round — Item 6: owner notices are honest, non-admin stays clean", () => {
    test("the pricing-tool HTML carries the honest cost-unverified wording for ADMIN; a non-ADMIN response never contains it", async ({
      page,
    }) => {
      await loginAs(page, repEmail, PASSWORD);
      const repRes = await page.request.get("/api/sales/pricing-tool");
      const repHtml = await repRes.text();
      expect(repHtml).not.toContain("provisional");
      expect(repHtml).not.toContain("Costs Unverified");
      expect(repHtml).not.toMatch(/not yet been reconciled|unreconciled/);
      expect(repHtml).not.toContain("20.52");
      expect(repHtml).not.toContain("AUDIT_OVERHEAD_PER_TECH_HR");
      expect(repHtml).not.toContain("TECH_WAGE");
      expect(repHtml).not.toContain("COST_DATA_VERIFIED");

      await loginAsAdmin(page);
      const adminRes = await page.request.get("/api/sales/pricing-tool");
      const adminHtml = await adminRes.text();
      expect(adminHtml).toContain("provisional");
      expect(adminHtml).toContain("Costs Unverified");
      expect(adminHtml).toMatch(/not yet been reconciled|unreconciled/);
      expect(adminHtml).toContain("20.52");
      expect(adminHtml).toContain("COST_DATA_VERIFIED");
    });

    test("storage get/set and send-quote refusal never leak provisional/unverified wording, dollar figures, or cost-constant names to a non-ADMIN caller", async ({
      page,
    }) => {
      await loginAsAdmin(page);
      const id = `owner-notice-${RUN_ID}`;
      createdQuoteIds.add(id);
      const quote = {
        clientName: `Owner Notice ${RUN_ID}`,
        id,
        clientEmail: `owner-notice-${RUN_ID}@example.com`,
        city: "Irvine",
        service: "standard",
        frequency: "Monthly",
        teamSize: 2,
        initialEstimatedHours: 4,
        initialEstimatedCost: 480,
        initialMinimumHours: 3,
        timeLowHrs: 1.5,
        suggested: "500.00",
        low: "500.00",
        high: "500.00",
        status: "pending",
        sentAt: null,
      };
      await seedQuote(page, id, quote);

      await loginAs(page, repEmail, PASSWORD);
      const forbidden = [/provisional/i, /unverified/i, /reconcil/i, /\$\d/, /20\.52/, /TECH_WAGE/, /AUDIT_OVERHEAD/];

      const getRes = await page.request.post("/api/sales/storage", { data: { op: "get", key: `quote:${id}` } });
      const getBody = await getRes.json();
      expect(getBody.marginHoldReason).toBeUndefined();
      expect(getBody.marginHold).toBe(true); // recurring Standard — unconditionally held
      const getText = JSON.stringify(getBody);
      for (const pattern of forbidden) expect(getText).not.toMatch(pattern);

      const setRes = await page.request.post("/api/sales/storage", {
        data: { op: "set", key: `quote:${id}`, value: JSON.stringify(quote) },
      });
      const setBody = await setRes.json();
      expect(setBody.marginHoldReason).toBeUndefined();
      const setText = JSON.stringify(setBody);
      for (const pattern of forbidden) expect(setText).not.toMatch(pattern);

      const sendRes = await page.request.post("/api/sales/send-quote", {
        data: { id, subject: "Test", body: "Test" },
      });
      const sendBody = await sendRes.json();
      expect(sendBody.error).toBe("This quote needs owner review before it can be sent.");
      const sendText = JSON.stringify(sendBody);
      for (const pattern of forbidden) expect(sendText).not.toMatch(pattern);
    });
  });
});
