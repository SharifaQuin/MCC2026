import { test, expect } from "@playwright/test";
import {
  evaluateMarginHold,
  evaluateQuoteMarginHold,
  describeMarginHold,
  minAcceptablePrice,
  costBreakdown,
} from "../src/lib/pricingMargin";

// Item 3/4 — direct, no-browser tests against src/lib/pricingMargin.ts
// itself (imported straight into the test, not driven through a page).
// These pin the 10% hard-floor boundary and the per-leg/low-end logic the
// server routes rely on, and (Item 4) prove the module never claims its
// cost inputs are "verified" against real records — it only ever computes
// against the existing, still-unverified constants it copied verbatim from
// src/content/sales-pricing-tool.html.

test.describe("pricingMargin.ts — 10% hard floor boundary", () => {
  test("exactly 10% margin passes (not held); a cent below the floor is held — strict less-than, not less-than-or-equal", async () => {
    const city = "Tustin";
    const service = "alacarte";
    const hours = 2;
    const teamSize = 2;

    const floor10 = minAcceptablePrice(hours, teamSize, 10, city, service);
    expect(floor10).not.toBeNull();

    // The reconstructed exact-floor price's marginPct lands at 10 to within
    // floating-point noise (dividing then re-multiplying through the same
    // formula) — it must never land BELOW 10, which is what "exactly 10%
    // passes" actually guards against; a cent under the floor must flip to
    // held every time, pinning the boundary is strictly "< 10", not "<= 10".
    const atFloor = evaluateMarginHold({ price: floor10!, hours, teamSize, city, service });
    expect(atFloor.marginPct).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(atFloor.held).toBe(false);

    const justUnder = evaluateMarginHold({ price: floor10! - 0.01, hours, teamSize, city, service });
    expect(justUnder.marginPct).toBeLessThan(10);
    expect(justUnder.held).toBe(true);

    const comfortablyAbove = evaluateMarginHold({ price: floor10! * 1.5, hours, teamSize, city, service });
    expect(comfortablyAbove.held).toBe(false);
  });

  test("below 21% is flagged territory but NOT the same thing as below 10% — a price between the two floors is not held", async () => {
    const city = "Irvine";
    const service = "standard";
    const hours = 3;
    const teamSize = 2;
    const floor10 = minAcceptablePrice(hours, teamSize, 10, city, service)!;
    const floor21 = minAcceptablePrice(hours, teamSize, 21, city, service)!;
    expect(floor21).toBeGreaterThan(floor10); // 21% target is strictly the higher bar

    const betweenTheTwoFloors = (floor10 + floor21) / 2;
    const result = evaluateMarginHold({ price: betweenTheTwoFloors, hours, teamSize, city, service });
    expect(result.marginPct).toBeGreaterThan(10);
    expect(result.marginPct).toBeLessThan(21);
    expect(result.held).toBe(false); // 10% is the only thing this module ever holds on
  });
});

test.describe("pricingMargin.ts — low end of a price range", () => {
  test("a service whose suggested price clears 10% but whose low end does not is held, reporting the low-end check", async () => {
    const city = "Tustin";
    const service = "deep";
    // Specialty's low end has genuinely fewer hours (coreLowHours) than the
    // point estimate — floors computed at each hour count accordingly.
    const floorMain = minAcceptablePrice(3, 2, 10, city, service)!;
    const floorLow = minAcceptablePrice(2, 2, 10, city, service)!;

    const evaluation = evaluateQuoteMarginHold({
      service,
      city,
      teamSize: 2,
      timeLowHrs: 3,
      suggested: floorMain * 1.5, // comfortably clears 10% at the point estimate
      low: floorLow * 0.95, // just under the floor computed from the LOWER hours
      lowHours: 2,
    });

    expect(evaluation.held).toBe(true);
    expect(evaluation.heldLegs).toEqual(["single"]);
    expect(evaluation.legs[0].checkedLowEnd).toBe(true);
    expect(evaluation.legs[0].marginPct).toBeLessThan(10);

    const reason = describeMarginHold(evaluation);
    expect(reason.toLowerCase()).toContain("below the 10% floor");
  });

  test("Standard/A la Carte/Airbnb: no lowHours given — the low end is checked at the SAME point-estimate hours, not a separate hour count", async () => {
    const city = "Tustin";
    const service = "alacarte";
    const floor = minAcceptablePrice(2, 2, 10, city, service)!;
    const evaluation = evaluateQuoteMarginHold({
      service,
      city,
      teamSize: 2,
      timeLowHrs: 2,
      suggested: floor * 1.5,
      low: floor * 0.95, // under the SAME floor (lowHours omitted => falls back to timeLowHrs)
    });
    expect(evaluation.held).toBe(true);
    expect(evaluation.legs[0].checkedLowEnd).toBe(true);
  });
});

test.describe("pricingMargin.ts — recurring Standard: two independent legs", () => {
  const city = "Irvine";
  const service = "standard";

  test("only the Initial leg held", async () => {
    const floorInit = minAcceptablePrice(4, 2, 10, city, service)!;
    const floorOngoing = minAcceptablePrice(1.5, 2, 10, city, service)!;
    const evaluation = evaluateQuoteMarginHold({
      service,
      city,
      frequency: "Weekly",
      teamSize: 2,
      initialEstimatedHours: 4,
      initialEstimatedCost: floorInit * 0.9,
      initialMinimumHours: 3,
      timeLowHrs: 1.5,
      suggested: floorOngoing * 1.6,
      low: floorOngoing * 1.6 * 0.8,
    });
    expect(evaluation.held).toBe(true);
    expect(evaluation.heldLegs).toEqual(["initial"]);
  });

  test("only the Ongoing leg held", async () => {
    const floorInit = minAcceptablePrice(4, 2, 10, city, service)!;
    const floorOngoing = minAcceptablePrice(1.5, 2, 10, city, service)!;
    const evaluation = evaluateQuoteMarginHold({
      service,
      city,
      frequency: "Weekly",
      teamSize: 2,
      initialEstimatedHours: 4,
      initialEstimatedCost: floorInit * 1.6,
      initialMinimumHours: 3,
      timeLowHrs: 1.5,
      suggested: floorOngoing * 0.9,
      low: floorOngoing * 0.9 * 0.8,
    });
    expect(evaluation.held).toBe(true);
    expect(evaluation.heldLegs).toEqual(["ongoing"]);
  });

  test("both legs held, and neither held — whole-quote hold is an OR across legs", async () => {
    const floorInit = minAcceptablePrice(4, 2, 10, city, service)!;
    const floorOngoing = minAcceptablePrice(1.5, 2, 10, city, service)!;
    const bothHeld = evaluateQuoteMarginHold({
      service,
      city,
      frequency: "Weekly",
      teamSize: 2,
      initialEstimatedHours: 4,
      initialEstimatedCost: floorInit * 0.9,
      initialMinimumHours: 3,
      timeLowHrs: 1.5,
      suggested: floorOngoing * 0.9,
      low: floorOngoing * 0.9 * 0.8,
    });
    expect(bothHeld.held).toBe(true);
    expect(bothHeld.heldLegs.sort()).toEqual(["initial", "ongoing"]);

    const neitherHeld = evaluateQuoteMarginHold({
      service,
      city,
      frequency: "Weekly",
      teamSize: 2,
      initialEstimatedHours: 4,
      initialEstimatedCost: floorInit * 1.6,
      initialMinimumHours: 3,
      timeLowHrs: 1.5,
      suggested: floorOngoing * 1.6,
      low: floorOngoing * 1.6 * 0.8,
    });
    expect(neitherHeld.held).toBe(false);
    expect(neitherHeld.heldLegs).toEqual([]);
  });

  test("the Initial leg's cost basis never drops below the 3-hour minimum, even if estimatedHours is entered lower", async () => {
    // The $360 minimum always applies for billing AND for the floor check —
    // an entered estimate of e.g. 1 hour must still be evaluated at 3 hours
    // worth of cost, not 1.
    const city2 = "Irvine";
    const floorAt1Hr = minAcceptablePrice(1, 2, 10, city2, service)!;
    const floorAt3Hr = minAcceptablePrice(3, 2, 10, city2, service)!;
    const evaluation = evaluateQuoteMarginHold({
      service,
      city: city2,
      frequency: "Monthly",
      teamSize: 2,
      initialEstimatedHours: 1,
      initialEstimatedCost: 360, // the $360 minimum, billed regardless of the 1-hr estimate
      initialMinimumHours: 3,
      timeLowHrs: 2,
      suggested: 100000, // ongoing leg irrelevant here — made comfortably unheld
      low: 90000,
    });
    // $360 clears the floor computed at 1 hour but not necessarily at 3 —
    // the point of this test is just that the module used 3, not 1.
    expect(floorAt3Hr).toBeGreaterThan(floorAt1Hr);
    const initialLeg = evaluation.legs.find((l) => l.leg === "initial")!;
    // Reconstruct what a (wrong) 1-hour-basis check would have said, to
    // prove the module's actual floorPrice10 matches the 3-hour basis, not it.
    expect(initialLeg.floorPrice10).toBeCloseTo(floorAt3Hr, 6);
  });
});

test.describe("pricingMargin.ts — Item 4: never claims verification it hasn't done", () => {
  test("no returned value from any exported function ever contains the words 'verified' or 'reconciled'", async () => {
    const samples: unknown[] = [
      evaluateMarginHold({ price: 500, hours: 3, teamSize: 2, city: "Irvine", service: "standard" }),
      costBreakdown(500, 3, 2, "Irvine", "standard"),
      minAcceptablePrice(3, 2, 21, "Irvine", "standard"),
    ];
    const heldEvaluation = evaluateQuoteMarginHold({
      service: "alacarte",
      city: "Tustin",
      teamSize: 2,
      timeLowHrs: 2,
      suggested: 1,
      low: 1,
    });
    samples.push(heldEvaluation, describeMarginHold(heldEvaluation));

    const flat = JSON.stringify(samples).toLowerCase();
    expect(flat).not.toContain("verified");
    expect(flat).not.toContain("reconciled");
  });
});
