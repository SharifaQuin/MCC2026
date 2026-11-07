// November 2026 cost calculator (owner-approved planning basis, fixed
// through Nov 30, 2026). These are conservative PLANNING ASSUMPTIONS, not
// anyone's actual pay, not a payroll change, and not a measure of actual
// monthly profit — see the PR body / the embedded HTML's own assumptions
// banner for the full history of what this replaces.
//
// Deliberately SEPARATE from the Profitability & Performance tab's
// real-payroll "actuals" constants (TECH_WAGE, WC_RATE, TAX_RATE,
// AUDIT_OVERHEAD_PER_TECH_HR, CITY_DRIVE, etc., all still defined in
// src/content/sales-pricing-tool.html) — this module never reads or writes
// any of those, and this plan never changes pay, break handling, historical
// payroll/TCS records, or the books. Only STRIPE_PCT/STRIPE_FLAT-equivalent
// values are shared in spirit (same numbers), re-declared here as
// CARD_PROCESSING_PCT/CARD_PROCESSING_FLAT so this module has zero import
// dependency on the other cost model.
//
// This module is no longer imported by any server route — sending is never
// blocked on margin (see send-quote/route.ts and storage/route.ts, which
// used to call evaluateQuoteMarginHold here before this PR). It exists
// purely as a single, pinned, unit-testable source for the exact math,
// mirrored verbatim in src/content/sales-pricing-tool.html's own
// ADMIN-ONLY cost block (the live, client-side ledger an ADMIN actually
// sees) — if either file's constants change, update the other to match.

export const NOV2026_BASE_WAGE_PER_PERSON_HR = 25;
export const NOV2026_PAYROLL_TAX_RATE = 0.105;
export const NOV2026_WORKERS_COMP_RATE = 0.135321;

// $25 * (1 + 0.105 + 0.135321) = $31.008025 per person-hour (onsite or travel).
export const NOV2026_LOADED_LABOR_PER_PERSON_HR =
  NOV2026_BASE_WAGE_PER_PERSON_HR * (1 + NOV2026_PAYROLL_TAX_RATE + NOV2026_WORKERS_COMP_RATE);

// November shared budget ÷ that month's onsite person-hours (405h55m) =
// $16.0121042907 overhead per ONSITE person-hour only — never added to
// travel person-hours. Computed from the two inputs below (not hardcoded)
// so the derivation is visible and matches at full floating-point precision;
// display this rounded to the cent ($16.01), never the full-precision value.
export const NOV2026_SHARED_BUDGET = 6499.58;
export const NOV2026_ONSITE_PERSON_HOURS = 405 + 55 / 60; // 405h55m
export const NOV2026_OVERHEAD_PER_ONSITE_PERSON_HR = NOV2026_SHARED_BUDGET / NOV2026_ONSITE_PERSON_HOURS;

// Card-payment assumption, not a verified universal fee — same rate as
// before (Stripe, confirmed July 2026), just explicitly re-labeled here as
// an assumption per the November plan.
export const CARD_PROCESSING_PCT = 0.029;
export const CARD_PROCESSING_FLAT = 0.3;

export interface CityTravelEstimate {
  minutesPerTravelingTech: number;
  vehicleAllowancePerJob: number;
}

// Approved November travel estimates, from the approved 48-job cohort —
// minutes per traveling tech, and a one-car mileage allowance per job
// (not per tech — the vehicle allowance is added once per job regardless
// of team size). Deliberately a SEPARATE dataset from CITY_DRIVE in
// sales-pricing-tool.html (that table still drives the Route Day Planner
// and CRM text — unrelated, untouched by this plan). Never borrow or
// invent a number for a city not listed here — see getCityTravelEstimate.
export const CITY_TRAVEL_ESTIMATES: Record<string, CityTravelEstimate> = {
  "Aliso Viejo": { minutesPerTravelingTech: 54.45, vehicleAllowancePerJob: 17.1 },
  "Corona Del Mar": { minutesPerTravelingTech: 30.9, vehicleAllowancePerJob: 9.2 },
  "Costa Mesa": { minutesPerTravelingTech: 40.35, vehicleAllowancePerJob: 12.38 },
  "Huntington Beach": { minutesPerTravelingTech: 34.35, vehicleAllowancePerJob: 10.56 },
  Irvine: { minutesPerTravelingTech: 35.79, vehicleAllowancePerJob: 10.31 },
  "Ladera Ranch": { minutesPerTravelingTech: 23.1, vehicleAllowancePerJob: 5.51 },
  "Laguna Beach": { minutesPerTravelingTech: 30.0, vehicleAllowancePerJob: 7.73 },
  "Laguna Hills": { minutesPerTravelingTech: 35.7, vehicleAllowancePerJob: 18.43 },
  "Laguna Niguel": { minutesPerTravelingTech: 45.21, vehicleAllowancePerJob: 16.56 },
  "Laguna Woods": { minutesPerTravelingTech: 22.43, vehicleAllowancePerJob: 8.55 },
  "Lake Forest": { minutesPerTravelingTech: 30.83, vehicleAllowancePerJob: 8.48 },
  "Mission Viejo": { minutesPerTravelingTech: 46.9, vehicleAllowancePerJob: 16.95 },
  "Rancho Santa Margarita": { minutesPerTravelingTech: 54.6, vehicleAllowancePerJob: 21.98 },
  "San Clemente": { minutesPerTravelingTech: 49.1, vehicleAllowancePerJob: 26.67 },
  "San Juan Capistrano": { minutesPerTravelingTech: 43.35, vehicleAllowancePerJob: 20.93 },
  Tustin: { minutesPerTravelingTech: 34.1, vehicleAllowancePerJob: 10.68 },
};

// null for any city not in the approved cohort — never fall back to a
// borrowed/invented number. Callers must show "Travel estimate incomplete"
// and compute cost/margin excluding travel, clearly labeled provisional.
export function getCityTravelEstimate(city: string): CityTravelEstimate | null {
  return CITY_TRAVEL_ESTIMATES[city] ?? null;
}

export interface NovemberCostInputs {
  hours: number; // onsite cleaning hours for this leg (not person-hours)
  teamSize: number;
  city: string;
}

export interface NovemberCostBreakdown {
  onsitePersonHours: number;
  travelPersonHours: number;
  vehicleAllowance: number;
  travelComplete: boolean;
  laborCost: number; // loaded labor across onsite + travel person-hours
  overheadCost: number; // overhead across onsite person-hours only
  baseCost: number; // B = laborCost + overheadCost + vehicleAllowance
}

// B = (onsite person-hours + travel person-hours) × 31.008025
//     + onsite person-hours × 16.0121042907
//     + vehicle allowance (once per job)
//
// Combined PERSON-hours: onsite = teamSize × hours (e.g. 2 techs × 3 hrs =
// 6 onsite person-hours). Travel minutes are converted to hours and
// multiplied by the number of techs traveling (assumed equal to the team
// actually sent to the job — the whole team travels together). For an
// unlisted city, travel person-hours and the vehicle allowance are both
// zero (never invented/borrowed) — travelComplete:false tells the caller
// to label the result provisional/excluding travel, not final/all-in.
export function computeNovemberBaseCost(input: NovemberCostInputs): NovemberCostBreakdown {
  const { hours, teamSize } = input;
  const travel = getCityTravelEstimate(input.city);
  const onsitePersonHours = teamSize * hours;
  const travelPersonHours = travel ? (travel.minutesPerTravelingTech / 60) * teamSize : 0;
  const vehicleAllowance = travel ? travel.vehicleAllowancePerJob : 0;
  const laborCost = (onsitePersonHours + travelPersonHours) * NOV2026_LOADED_LABOR_PER_PERSON_HR;
  const overheadCost = onsitePersonHours * NOV2026_OVERHEAD_PER_ONSITE_PERSON_HR;
  const baseCost = laborCost + overheadCost + vehicleAllowance;
  return {
    onsitePersonHours,
    travelPersonHours,
    vehicleAllowance,
    travelComplete: !!travel,
    laborCost,
    overheadCost,
    baseCost,
  };
}

export interface NovemberQuoteCost extends NovemberCostBreakdown {
  cardProcessing: number;
  cost: number;
  margin: number;
  marginPct: number;
}

// Cost = B + card-processing assumption at the quoted price.
// Margin = (price - Cost) / price.
export function computeNovemberQuoteCost(price: number, input: NovemberCostInputs): NovemberQuoteCost {
  const base = computeNovemberBaseCost(input);
  const cardProcessing = price * CARD_PROCESSING_PCT + CARD_PROCESSING_FLAT;
  const cost = base.baseCost + cardProcessing;
  const margin = price - cost;
  const marginPct = price > 0 ? (margin / price) * 100 : 0;
  return { ...base, cardProcessing, cost, margin, marginPct };
}

// Minimum price to clear a 10% margin, accounting for the price-dependent
// card-processing fee:
//   margin >= 10%  <=>  price - Cost >= 0.10*price  <=>  0.90*price >= Cost
//   Cost = B + 0.30 + 0.029*price
//   0.90*price >= B + 0.30 + 0.029*price  <=>  0.871*price >= B + 0.30
//   price >= (B + 0.30) / 0.871
// Rounded UP to the cent — a minimum must never understate itself via
// floating-point/rounding-down noise.
export function novemberMinimumPrice(input: NovemberCostInputs): number {
  const base = computeNovemberBaseCost(input);
  const raw = (base.baseCost + CARD_PROCESSING_FLAT) / 0.871;
  return Math.ceil(raw * 100) / 100;
}

// Generalized minimum-price-for-target-margin, used by the "walk-away
// floor" box for an arbitrary target % (not just the fixed 10% warning
// threshold below). Same derivation as novemberMinimumPrice, generalized:
// price >= (B + 0.30) / (1 - CARD_PROCESSING_PCT - targetFrac). Returns
// null when the target is too high to solve for (denominator <= 0).
export function novemberMinimumPriceForTarget(input: NovemberCostInputs, targetMarginPct: number): number | null {
  const base = computeNovemberBaseCost(input);
  const targetFrac = targetMarginPct / 100;
  const denom = 1 - CARD_PROCESSING_PCT - targetFrac;
  if (denom <= 0) return null;
  const raw = (base.baseCost + CARD_PROCESSING_FLAT) / denom;
  return Math.ceil(raw * 100) / 100;
}

export type QuoteLeg = "single" | "initial" | "ongoing";

export interface LegMarginWarning {
  leg: QuoteLeg;
  marginPct: number;
  minimumPrice: number;
  // Floored at $0 and rounded to the cent. Only meaningful (and only ever
  // shown by a caller) when belowMinimum is true — a leg already at or
  // above 10% has nothing to add.
  addToReachMinimum: number;
  // Strictly below 10% — exactly 10% (or above) is never a warning.
  belowMinimum: boolean;
  travelComplete: boolean;
}

// Non-blocking warning only — this NEVER refuses or gates anything (the
// old 10%-floor sending block / approval gate is removed entirely; see the
// PR body). A non-positive/non-finite price (e.g. a manually-built quote
// with its price left blank) is "not evaluable", not a genuine $0 below-
// minimum price — belowMinimum is false in that case, same treatment as
// the removed evaluateMarginHold had for the old model.
export function evaluateLegWarning(
  leg: QuoteLeg,
  price: number,
  hours: number,
  teamSize: number,
  city: string,
): LegMarginWarning {
  const input: NovemberCostInputs = { hours, teamSize, city };
  const minimumPrice = novemberMinimumPrice(input);
  if (!Number.isFinite(price) || price <= 0) {
    return {
      leg,
      marginPct: Infinity,
      minimumPrice,
      addToReachMinimum: 0,
      belowMinimum: false,
      travelComplete: getCityTravelEstimate(city) !== null,
    };
  }
  const quoteCost = computeNovemberQuoteCost(price, input);
  const addToReachMinimum = Math.max(0, Math.round((minimumPrice - price) * 100) / 100);
  return {
    leg,
    marginPct: quoteCost.marginPct,
    minimumPrice,
    addToReachMinimum,
    belowMinimum: quoteCost.marginPct < 10,
    travelComplete: quoteCost.travelComplete,
  };
}
