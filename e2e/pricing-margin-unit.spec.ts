import { test, expect } from "@playwright/test";
import {
  NOV2026_BASE_WAGE_PER_PERSON_HR,
  NOV2026_PAYROLL_TAX_RATE,
  NOV2026_WORKERS_COMP_RATE,
  NOV2026_LOADED_LABOR_PER_PERSON_HR,
  NOV2026_SHARED_BUDGET,
  NOV2026_ONSITE_PERSON_HOURS,
  NOV2026_OVERHEAD_PER_ONSITE_PERSON_HR,
  CARD_PROCESSING_PCT,
  CARD_PROCESSING_FLAT,
  CITY_TRAVEL_ESTIMATES,
  getCityTravelEstimate,
  computeNovemberBaseCost,
  computeNovemberQuoteCost,
  novemberMinimumPrice,
  novemberMinimumPriceForTarget,
  evaluateLegWarning,
} from "../src/lib/pricingMargin";

// Direct, no-browser tests against src/lib/pricingMargin.ts itself (the
// November 2026 cost calculator) — pins the exact math the embedded HTML's
// ADMIN-ONLY mirror must match, the two-tech onsite/travel person-hour
// model, the non-blocking below-10% warning (with its exact rounding
// rules), and listed-vs-unlisted city handling. This cost calculator is a
// non-blocking WARNING ONLY — nothing here, or in any server route,
// refuses a send on margin; see e2e/send-quote-margin-not-blocking.spec.ts
// for the browser-level proof that sending still works regardless of
// margin, and that recipient validation / duplicate-send / Scam
// protections remain fully effective.

test.describe("pricingMargin.ts — exact loaded-labor / overhead math (display rounding only)", () => {
  test("loaded labor is exactly $31.008025/person-hour ($25 base × (1 + 10.5% payroll tax + 13.5321% workers' comp))", () => {
    expect(NOV2026_BASE_WAGE_PER_PERSON_HR).toBe(25);
    expect(NOV2026_PAYROLL_TAX_RATE).toBe(0.105);
    expect(NOV2026_WORKERS_COMP_RATE).toBe(0.135321);
    expect(NOV2026_LOADED_LABOR_PER_PERSON_HR).toBe(31.008025);
  });

  test("overhead is $6,499.58 ÷ 405h55m onsite person-hours ≈ $16.0121042907/onsite-hour, at full precision", () => {
    expect(NOV2026_SHARED_BUDGET).toBe(6499.58);
    expect(NOV2026_ONSITE_PERSON_HOURS).toBeCloseTo(405 + 55 / 60, 10);
    expect(NOV2026_OVERHEAD_PER_ONSITE_PERSON_HR).toBeCloseTo(16.0121042907, 6);
    // Display rounding only — the full-precision value itself is kept (not
    // pre-rounded to $16.01) for downstream math.
    expect(NOV2026_OVERHEAD_PER_ONSITE_PERSON_HR.toFixed(2)).toBe("16.01");
  });

  test("onsite labor + overhead = $47.0201292907/person-hour, before vehicle allowance and processing", () => {
    const sum = NOV2026_LOADED_LABOR_PER_PERSON_HR + NOV2026_OVERHEAD_PER_ONSITE_PERSON_HR;
    expect(sum).toBeCloseTo(47.0201292907, 6);
  });

  test("card processing is still 2.9% + $0.30 — unchanged, just re-labeled an assumption", () => {
    expect(CARD_PROCESSING_PCT).toBe(0.029);
    expect(CARD_PROCESSING_FLAT).toBe(0.3);
  });
});

test.describe("pricingMargin.ts — two-tech onsite/travel person-hours, vehicle allowance once per job", () => {
  test("2 techs cleaning 3 hours = 6 onsite person-hours; travel minutes × teamSize ÷ 60 = travel person-hours; vehicle allowance added once, not per tech", () => {
    const city = "Irvine"; // 35.79 min/tech, $10.31 one-car allowance
    const hours = 3;
    const teamSize = 2;
    const base = computeNovemberBaseCost({ hours, teamSize, city });

    expect(base.onsitePersonHours).toBe(6);
    expect(base.travelPersonHours).toBeCloseTo((35.79 / 60) * 2, 10);
    expect(base.vehicleAllowance).toBe(10.31); // once per job, never doubled for 2 techs
    expect(base.travelComplete).toBe(true);

    const expectedLabor = (base.onsitePersonHours + base.travelPersonHours) * NOV2026_LOADED_LABOR_PER_PERSON_HR;
    const expectedOverhead = base.onsitePersonHours * NOV2026_OVERHEAD_PER_ONSITE_PERSON_HR;
    expect(base.laborCost).toBeCloseTo(expectedLabor, 6);
    expect(base.overheadCost).toBeCloseTo(expectedOverhead, 6);
    expect(base.baseCost).toBeCloseTo(expectedLabor + expectedOverhead + 10.31, 6);
  });

  test("overhead is never added to travel person-hours — only onsite", () => {
    const withTravel = computeNovemberBaseCost({ hours: 3, teamSize: 2, city: "San Clemente" }); // large travel minutes
    const withoutTravelCity = computeNovemberBaseCost({ hours: 3, teamSize: 2, city: "Nowhere, OC" });
    // Same onsite hours => same overhead, regardless of how much travel the city adds.
    expect(withTravel.overheadCost).toBeCloseTo(withoutTravelCity.overheadCost, 6);
    expect(withTravel.overheadCost).toBeCloseTo(6 * NOV2026_OVERHEAD_PER_ONSITE_PERSON_HR, 6);
  });

  test("B = (onsite + travel person-hours) × loaded labor + onsite person-hours × overhead + vehicle allowance — full formula, a 3-tech job", () => {
    const city = "Laguna Niguel"; // 45.21 min/tech, $16.56 allowance
    const hours = 2.5;
    const teamSize = 3;
    const base = computeNovemberBaseCost({ hours, teamSize, city });
    const onsite = teamSize * hours;
    const travel = (45.21 / 60) * teamSize;
    const expectedB = (onsite + travel) * NOV2026_LOADED_LABOR_PER_PERSON_HR + onsite * NOV2026_OVERHEAD_PER_ONSITE_PERSON_HR + 16.56;
    expect(base.baseCost).toBeCloseTo(expectedB, 6);
  });
});

test.describe("pricingMargin.ts — Cost = B + card processing; Margin = (price - Cost) / price", () => {
  test("quote cost ties out exactly against the formula", () => {
    const input = { hours: 3, teamSize: 2, city: "Tustin" };
    const price = 400;
    const qc = computeNovemberQuoteCost(price, input);
    const base = computeNovemberBaseCost(input);
    const expectedCardProcessing = price * 0.029 + 0.3;
    expect(qc.cardProcessing).toBeCloseTo(expectedCardProcessing, 6);
    expect(qc.cost).toBeCloseTo(base.baseCost + expectedCardProcessing, 6);
    expect(qc.margin).toBeCloseTo(price - qc.cost, 6);
    expect(qc.marginPct).toBeCloseTo((qc.margin / price) * 100, 6);
  });

  test("a non-positive or non-finite price has marginPct 0 from computeNovemberQuoteCost itself (evaluateLegWarning handles the 'not evaluable' case separately)", () => {
    const input = { hours: 3, teamSize: 2, city: "Tustin" };
    expect(computeNovemberQuoteCost(0, input).marginPct).toBe(0);
  });
});

test.describe("pricingMargin.ts — below-10% warning, no warning at exactly 10%, Add $X rounded up correctly", () => {
  test("minimum price = (B + 0.30) / 0.871, rounded UP to the cent — exactly reaching it clears 10% (not held); a cent under is held", () => {
    const input = { hours: 3, teamSize: 2, city: "Costa Mesa" };
    const minPrice = novemberMinimumPrice(input);

    const atMin = evaluateLegWarning("single", minPrice, input.hours, input.teamSize, input.city);
    expect(atMin.marginPct).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(atMin.belowMinimum).toBe(false);
    expect(atMin.addToReachMinimum).toBe(0);

    const justUnder = evaluateLegWarning("single", minPrice - 0.01, input.hours, input.teamSize, input.city);
    expect(justUnder.marginPct).toBeLessThan(10);
    expect(justUnder.belowMinimum).toBe(true);
    expect(justUnder.addToReachMinimum).toBeCloseTo(0.01, 6);
  });

  test("comfortably above the minimum: no warning, Add $0", () => {
    const input = { hours: 3, teamSize: 2, city: "Costa Mesa" };
    const minPrice = novemberMinimumPrice(input);
    const result = evaluateLegWarning("single", minPrice * 1.5, input.hours, input.teamSize, input.city);
    expect(result.belowMinimum).toBe(false);
    expect(result.addToReachMinimum).toBe(0);
  });

  test("Add $X is rounded UP to the cent — a minimum price that doesn't land on an exact cent still never understates what's needed", () => {
    // Pick a price string a cent below a minimum that itself isn't a round
    // number, and confirm ceil-to-cent semantics on the minimum itself.
    const input = { hours: 1.37, teamSize: 2, city: "Mission Viejo" };
    const base = computeNovemberBaseCost(input);
    const raw = (base.baseCost + 0.3) / 0.871;
    const minPrice = novemberMinimumPrice(input);
    expect(minPrice).toBeGreaterThanOrEqual(raw);
    expect(minPrice - raw).toBeLessThan(0.01 + 1e-9);
    // The rounded minimum, reconstructed from a price one cent below it,
    // must report an addToReachMinimum of exactly one cent.
    const w = evaluateLegWarning("single", minPrice - 0.01, input.hours, input.teamSize, input.city);
    expect(w.addToReachMinimum).toBeCloseTo(0.01, 6);
  });

  test("addToReachMinimum is floored at $0, never negative, even if called on an already-fine price", () => {
    const input = { hours: 5, teamSize: 2, city: "Tustin" };
    const result = evaluateLegWarning("ongoing", 100000, input.hours, input.teamSize, input.city);
    expect(result.addToReachMinimum).toBe(0);
  });

  test("a non-positive/non-finite price is 'not evaluable' — never a genuine below-minimum warning", () => {
    const input = { hours: 3, teamSize: 2, city: "Tustin" };
    expect(evaluateLegWarning("single", 0, input.hours, input.teamSize, input.city).belowMinimum).toBe(false);
    expect(evaluateLegWarning("single", -5, input.hours, input.teamSize, input.city).belowMinimum).toBe(false);
    expect(evaluateLegWarning("single", NaN, input.hours, input.teamSize, input.city).belowMinimum).toBe(false);
  });

  test("the generalized target-margin formula (walk-away floor) matches the fixed-10% formula when targetMarginPct is 10", () => {
    const input = { hours: 3, teamSize: 2, city: "Laguna Beach" };
    expect(novemberMinimumPriceForTarget(input, 10)).toBeCloseTo(novemberMinimumPrice(input), 2);
  });

  test("the walk-away floor returns null when the target margin is too high to solve for", () => {
    const input = { hours: 3, teamSize: 2, city: "Laguna Beach" };
    expect(novemberMinimumPriceForTarget(input, 97.2)).toBeNull(); // 1 - 0.029 - 0.972 <= 0
  });
});

test.describe("pricingMargin.ts — listed and unlisted cities", () => {
  test("all 16 approved cities are present with their exact minutes/allowance values", () => {
    expect(CITY_TRAVEL_ESTIMATES["Aliso Viejo"]).toEqual({ minutesPerTravelingTech: 54.45, vehicleAllowancePerJob: 17.1 });
    expect(CITY_TRAVEL_ESTIMATES["San Clemente"]).toEqual({ minutesPerTravelingTech: 49.1, vehicleAllowancePerJob: 26.67 });
    expect(CITY_TRAVEL_ESTIMATES["Tustin"]).toEqual({ minutesPerTravelingTech: 34.1, vehicleAllowancePerJob: 10.68 });
    expect(Object.keys(CITY_TRAVEL_ESTIMATES)).toHaveLength(16);
  });

  test("an unlisted city (including one in the OLD CITY_DRIVE dataset, like Anaheim) never invents or borrows a number", () => {
    expect(getCityTravelEstimate("Anaheim")).toBeNull();
    expect(getCityTravelEstimate("Some Made Up City")).toBeNull();
  });

  test("an unlisted city's cost excludes travel person-hours and vehicle allowance entirely, and is marked incomplete", () => {
    const input = { hours: 3, teamSize: 2, city: "Anaheim" };
    const base = computeNovemberBaseCost(input);
    expect(base.travelPersonHours).toBe(0);
    expect(base.vehicleAllowance).toBe(0);
    expect(base.travelComplete).toBe(false);
    // Onsite-only cost is still computed (sending must still work) —
    // never NaN/undefined.
    expect(base.baseCost).toBeCloseTo(6 * NOV2026_LOADED_LABOR_PER_PERSON_HR + 6 * NOV2026_OVERHEAD_PER_ONSITE_PERSON_HR, 6);
  });

  test("a listed city's warning/minimum both reflect travelComplete: true; an unlisted city's reflect false — per-quote-leg, as evaluateLegWarning reports it", () => {
    const listed = evaluateLegWarning("single", 500, 3, 2, "Irvine");
    const unlisted = evaluateLegWarning("single", 500, 3, 2, "Anaheim");
    expect(listed.travelComplete).toBe(true);
    expect(unlisted.travelComplete).toBe(false);
    // The unlisted leg's minimum price is strictly lower (it excludes travel
    // labor + vehicle allowance entirely) — never a NaN/invented value.
    expect(unlisted.minimumPrice).toBeLessThan(listed.minimumPrice);
    expect(Number.isFinite(unlisted.minimumPrice)).toBe(true);
  });
});
