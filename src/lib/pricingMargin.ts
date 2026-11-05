// Item 3 (margin protection — 10% hard floor): the pricing/quote tool's
// cost model is ADMIN-ONLY and physically stripped from a non-ADMIN
// browser's response (see src/lib/salesPricingToolAccess.ts and
// src/content/sales-pricing-tool.html's own `/* ADMIN-ONLY:START */` cost
// block, ~line 1397 and ~line 1986) — a Sales Rep's browser never receives
// TECH_WAGE, the CITY_DRIVE dataset, fixedCostFor/costBreakdown/
// minAcceptablePrice, or any other cost constant/function, by design. So a
// Sales Rep's own save/send can never compute a margin client-side, and the
// hold decision has to be computed here instead, server-side, where this
// data already safely lives only in server code and is never shipped to
// any browser.
//
// Every constant below is copied VERBATIM from
// src/content/sales-pricing-tool.html (its own `/* ADMIN-ONLY:START */`
// cost-constant block, ~lines 1397-1436, 1534-1536, 1993-1999) — not
// retyped or re-derived, to rule out a transcription error silently
// diverging the two cost models. If either file's cost constants change,
// the other must be updated to match — each file carries a comment
// cross-referencing this one.
//
// Item 4 (cost verification): these are EXISTING, already-in-production
// constants — this module does not attempt to re-derive, verify, or
// reconcile them against real payroll/TCS/mileage source records (no such
// records are committed to this repository, and this coding session has no
// access to the owner's actual Gusto/TCS accounts — see the PR body's
// "Item 4 — cost verification" section for what was checked and what a
// real close-out would need). Nothing in this module ever labels a margin
// result "verified" or "reconciled" — it only ever computes against these
// still-unverified inputs, exactly as they already drive the existing
// ADMIN-ONLY ledger/floor-price UI that shipped before this PR.

// Correction round (Item 4 follow-up): the cost constants below are STILL
// exactly as unverified as the header comment above already says — nothing
// about them has changed here. What's new is enforcing that honestly:
// until a real reconciliation is actually done — a TCS job-time export, a
// Gusto payroll export, and the mileage reimbursement log (see PR #24's own
// "Item 4 — cost verification" section for why none of these three could be
// obtained in this coding session) — every recurring-Standard quote is held
// UNCONDITIONALLY below, regardless of what margin these still-unverified
// costs compute to (see evaluateQuoteMarginHold's isRecurringStandard
// branch). Flip this to `true` only once that reconciliation has actually
// happened — never as part of this PR, and never by guessing.
export const COST_DATA_VERIFIED = false;

export const TECH_WAGE = 25;
export const WC_RATE = 0.15;
export const TAX_RATE = 0.105;
export const MILEAGE_RATE = 0.725;
export const TEAM_MILES_PER_DAY = 52;
export const TEAM_BILLABLE_HRS_PER_DAY = 8.1;
export const STRIPE_PCT = 0.029; // Confirmed July 2026: Stripe processing fee, replaces old 10% admin fee placeholder
export const STRIPE_FLAT = 0.3;

// UPDATED (Sep 2026 client audit) — replaces the monthly overhead table for
// all cost math. $7,758.38/mo overhead (Jun–Aug avg) + ~40 hrs/mo paid
// training/meeting time, ÷ 438 client-attributable paid tech-hours/mo
// (cleaning + drive, TCS payroll Jul–Sep 2026). Applied per PAID TECH-HOUR
// (each tech's cleaning hours + drive hours). Workers' comp is NOT in here
// (it's WC_RATE). STILL UNVERIFIED against a real payroll/TCS export in
// this coding session — see the module header and PR body Item 4 section.
export const AUDIT_OVERHEAD_PER_TECH_HR = 20.52;

// REAL DATA (Sep 2026 client audit) — TCS drive logs, Jul 1–Sep 28, 2026.
// drive = avg drive hours PER TECH per visit (includes share of the drive
// back to the office); mile = avg mileage reimbursement $ per visit (one
// vehicle, $0.72/mi); day = weekday the team is most often already in that
// city (unused here — the day/route-planner fields aren't needed by this
// pure cost/margin calculator).
export const CITY_DRIVE: Record<string, { drive: number; mile: number; visits: number; day: string }> = {
  "Aliso Viejo": { drive: 0.44, mile: 10.91, visits: 7, day: "Thursday" },
  Anaheim: { drive: 0.57, mile: 15.02, visits: 1, day: "Thursday" },
  "Corona Del Mar": { drive: 0.39, mile: 7.02, visits: 26, day: "Friday" },
  "Costa Mesa": { drive: 0.36, mile: 6.09, visits: 17, day: "Wednesday" },
  "Dana Point": { drive: 0.33, mile: 9.09, visits: 7, day: "Tuesday" },
  "Huntington Beach": { drive: 0.46, mile: 8.36, visits: 18, day: "Monday" },
  Irvine: { drive: 0.42, mile: 7.08, visits: 53, day: "Wednesday" },
  "Ladera Ranch": { drive: 0.3, mile: 6.14, visits: 5, day: "Monday" },
  "Laguna Beach": { drive: 0.75, mile: 10.02, visits: 22, day: "Friday" },
  "Laguna Hills": { drive: 0.53, mile: 12.21, visits: 3, day: "Thursday" },
  "Laguna Niguel": { drive: 0.61, mile: 14.07, visits: 22, day: "Tuesday" },
  "Laguna Woods": { drive: 0.5, mile: 7.69, visits: 8, day: "Friday" },
  "Lake Forest": { drive: 0.6, mile: 10.82, visits: 12, day: "Wednesday" },
  "Long Beach": { drive: 0.57, mile: 9.26, visits: 2, day: "Monday" },
  "Mission Viejo": { drive: 0.44, mile: 9.66, visits: 30, day: "Thursday" },
  "Newport Beach": { drive: 0.79, mile: 10.64, visits: 1, day: "Thursday" },
  "Rancho Santa Margarita": { drive: 0.46, mile: 8.97, visits: 14, day: "Thursday" },
  "San Clemente": { drive: 0.7, mile: 22.35, visits: 10, day: "Monday" },
  "San Juan Capistrano": { drive: 0.51, mile: 7.97, visits: 4, day: "Monday" },
  Tustin: { drive: 0.2, mile: 3.37, visits: 13, day: "Thursday" },
};
export const CITY_DRIVE_BORROW: Record<string, string> = {
  "Newport Coast": "Corona Del Mar",
  "Santa Ana": "Tustin",
  "Rancho Mission Viejo": "San Juan Capistrano",
};
export const CITY_DRIVE_FALLBACK = { drive: 0.6, mile: 14.0, visits: 0, day: "" }; // 'Other' — deliberately above the 0.47 hr / $9.09 company average

// REAL DATA (July 2026) — Housekeeping mileage, from payroll mileage log +
// CA minimum wage. UPDATED (Aug 2026, owner-confirmed): drive time wage is
// $16.90/hr (CA min wage) PER TECHNICIAN, 1 hour each, for every team size.
export const HK_ROUNDTRIP_MILES = 20.31 * 2; // office (1504 Brookhollow Dr, Santa Ana) <-> client, real logged one-way distance x2
export const DRIVE_HOURS_PER_TECH = 1.0; // confirmed Aug 2026: 1 hr drive time per technician, all team sizes
export const CA_MIN_WAGE = 16.9; // confirmed July 2026, CA statewide minimum wage

interface CityDriveInfo {
  drive: number;
  mile: number;
  visits: number;
  day: string;
  city: string;
  borrowed: string | null;
  fallback?: boolean;
}

function getCityDrive(city: string): CityDriveInfo {
  if (CITY_DRIVE[city]) return { ...CITY_DRIVE[city], city, borrowed: null };
  if (CITY_DRIVE_BORROW[city]) {
    const source = CITY_DRIVE_BORROW[city];
    return { ...CITY_DRIVE[source], city, borrowed: source };
  }
  return { ...CITY_DRIVE_FALLBACK, city, borrowed: null, fallback: true };
}

interface FixedCostBreakdown {
  cleaningWage: number;
  driveWage: number;
  wage: number;
  wc: number;
  tax: number;
  mileage: number;
  hardCost: number;
  overhead: number;
  cityDrive: CityDriveInfo;
  driveHrsTotal: number;
  paidTechHours: number;
}

// Mirrors fixedCostFor() in sales-pricing-tool.html exactly, with `city` and
// `service` taken as explicit parameters instead of read from the DOM
// (document.getElementById('city-select')) / live client `state` — this
// module runs server-side with no DOM and no shared `state` object.
function fixedCostFor(hours: number, teamSize: number, city: string, service: string): FixedCostBreakdown {
  const isSolo = teamSize === 1;
  const cd = getCityDrive(city);
  const cleaningWage = teamSize * TECH_WAGE * hours;
  const driveHrsTotal = teamSize * cd.drive;
  const driveWage = driveHrsTotal * TECH_WAGE;
  const wage = cleaningWage + driveWage;
  const wc = wage * WC_RATE;
  const tax = wage * TAX_RATE;
  const mileage = isSolo && service === "housekeeping" ? HK_ROUNDTRIP_MILES * MILEAGE_RATE : cd.mile;
  const hardCost = wage + wc + tax + mileage;
  const paidTechHours = teamSize * hours + driveHrsTotal;
  const overhead = AUDIT_OVERHEAD_PER_TECH_HR * paidTechHours;
  return { cleaningWage, driveWage, wage, wc, tax, mileage, hardCost, overhead, cityDrive: cd, driveHrsTotal, paidTechHours };
}

export interface CostBreakdown extends FixedCostBreakdown {
  admin: number;
  totalCost: number;
  margin: number;
  marginPct: number;
}

// Mirrors costBreakdown() in sales-pricing-tool.html exactly.
export function costBreakdown(price: number, hours: number, teamSize: number, city: string, service: string): CostBreakdown {
  const f = fixedCostFor(hours, teamSize, city, service);
  const admin = price * STRIPE_PCT + STRIPE_FLAT;
  const totalCost = f.hardCost + f.overhead + admin;
  const margin = price - totalCost;
  const marginPct = price > 0 ? (margin / price) * 100 : 0;
  return { ...f, admin, totalCost, margin, marginPct };
}

// Mirrors minAcceptablePrice() in sales-pricing-tool.html exactly.
export function minAcceptablePrice(
  hours: number,
  teamSize: number,
  targetMarginPct: number,
  city: string,
  service: string,
): number | null {
  const f = fixedCostFor(hours, teamSize, city, service);
  const fixed = f.hardCost + f.overhead + STRIPE_FLAT;
  const targetFrac = targetMarginPct / 100;
  const denom = 1 - STRIPE_PCT - targetFrac;
  if (denom <= 0) return null; // target margin too high to solve for
  return fixed / denom;
}

export interface SingleCheckResult {
  held: boolean;
  marginPct: number;
  floorPrice10: number;
}

// The hard 10% floor check for one price/hours/teamSize/city/service point.
// Strictly below 10% is held; exactly 10% passes (strict less-than, not
// less-than-or-equal) — see evaluateQuoteMarginHold's own tests for the
// pinned boundary.
export function evaluateMarginHold(input: {
  price: number;
  hours: number;
  teamSize: number;
  city: string;
  service: string;
}): SingleCheckResult {
  const b = costBreakdown(input.price, input.hours, input.teamSize, input.city, input.service);
  const floor = minAcceptablePrice(input.hours, input.teamSize, 10, input.city, input.service);
  return {
    held: b.marginPct < 10,
    marginPct: b.marginPct,
    floorPrice10: floor ?? Infinity,
  };
}

export type QuoteLeg = "single" | "initial" | "ongoing";

export interface LegMarginResult {
  leg: QuoteLeg;
  held: boolean;
  marginPct: number;
  floorPrice10: number;
  checkedLowEnd: boolean;
  // Correction round (Item 1): which of the two, materially different,
  // reasons this leg is held for — 'below-floor' is the original, existing
  // genuine-margin check (this leg's own computed margin, or its low end,
  // is actually below the 10% floor). 'unverified-cost' is new: the
  // isRecurringStandard branch forces this below, regardless of the real
  // computed marginPct/floorPrice10 (which are kept, unmodified, for
  // provisional reporting) — see evaluateQuoteMarginHold.
  heldReason: "unverified-cost" | "below-floor";
}

export interface QuoteMarginEvaluation {
  held: boolean;
  heldLegs: QuoteLeg[];
  legs: LegMarginResult[];
}

// Shape of the fields this module reads off a saved `quote:<id>` record
// (src/app/api/sales/storage/route.ts's "set" case, and
// src/app/api/sales/send-quote/route.ts) — a loose/partial type since the
// stored JSON is user-saved data, not a typed column; every field is
// defensively coerced with Number()/??, never trusted as already-valid.
export interface QuoteMarginInput {
  service?: string;
  frequency?: string;
  city?: string;
  teamSize?: number;
  suggested?: string | number;
  low?: string | number;
  lowHours?: number | null;
  timeLowHrs?: number;
  initialEstimatedHours?: number;
  initialEstimatedCost?: number;
  initialMinimumHours?: number;
}

function evaluateLeg(
  leg: QuoteLeg,
  price: number,
  lowPrice: number | null,
  hours: number,
  lowHours: number | null,
  teamSize: number,
  city: string,
  service: string,
): LegMarginResult {
  const main = evaluateMarginHold({ price, hours, teamSize, city, service });
  // Item 3: check the low end of any range against the floor too, not just
  // the suggested/expected price. For a service whose low end has genuinely
  // different hours (specialty's coreLowHours), use those lower hours — a
  // lighter job costs less to run, so its floor is lower too. For every
  // other service, the low end is price-only (±20%) at the SAME point-
  // estimate hours, so lowHours is left null and the same `hours` is reused.
  const lowHoursBasis = lowHours != null ? lowHours : hours;
  const low =
    lowPrice != null ? evaluateMarginHold({ price: lowPrice, hours: lowHoursBasis, teamSize, city, service }) : null;
  const held = main.held || (low ? low.held : false);
  const worse = low && low.marginPct < main.marginPct ? low : main;
  return {
    leg,
    held,
    marginPct: worse.marginPct,
    floorPrice10: worse.floorPrice10,
    checkedLowEnd: !!low,
    heldReason: "below-floor",
  };
}

// The single entry point used by both src/app/api/sales/storage/route.ts
// (to compute and persist the `marginHold` boolean on every quote save) and
// src/app/api/sales/send-quote/route.ts (to recompute it fresh, server-side,
// right before actually sending — never trusting whatever was last stored).
//
// A recurring Standard quote (service==='standard' && a recurring
// frequency, identified here by the presence of initialEstimatedHours/Cost
// — a legacy quote saved before this PR simply lacks them and is treated as
// a single-leg quote using its ordinary suggested/low fields) gets TWO
// independent hold checks — Initial and Ongoing — and the whole quote is
// held if EITHER leg is below the 10% floor. Every other quote (every other
// service, and one-time Standard) gets exactly one check.
// Correction round (Item 1): `opts.costDataVerified` lets a caller (tests
// only — see e2e/pricing-margin-unit.spec.ts) exercise "what if the cost
// inputs HAD been reconciled" without mutating the real exported
// COST_DATA_VERIFIED constant. Both server routes that actually enforce
// this (storage's "set"/"get" cases and send-quote) call this with NO
// second argument, so they always get the real, current COST_DATA_VERIFIED
// value — there is no way for a route, or a quote's own saved data, to
// supply a different value.
export function evaluateQuoteMarginHold(
  q: QuoteMarginInput,
  opts?: { costDataVerified?: boolean },
): QuoteMarginEvaluation {
  const costDataVerified = opts?.costDataVerified ?? COST_DATA_VERIFIED;
  const city = q.city || "Other";
  const service = q.service || "";
  const teamSize = Number(q.teamSize) || 2;
  const isRecurringStandard =
    service === "standard" &&
    !!q.frequency &&
    q.frequency !== "One-Time" &&
    q.initialEstimatedHours != null &&
    q.initialEstimatedCost != null;

  const legs: LegMarginResult[] = [];

  if (isRecurringStandard) {
    // Initial leg: team of 2 always (Item 2), never less than the 3-hr
    // minimum for COST purposes (the $360 minimum always applies — the
    // floor check must use the hours that are actually being paid for, not
    // a possibly-lower entered estimate). No recurring discount ever
    // applies to this leg — guaranteed by Item 2's design (it never reads
    // RECURRING_STANDARD_DISCOUNTS), not re-implemented/re-checked here.
    const minHours = q.initialMinimumHours ?? 3;
    const initialHours = Math.max(Number(q.initialEstimatedHours), minHours);
    const initialPrice = Number(q.initialEstimatedCost);
    legs.push(evaluateLeg("initial", initialPrice, null, initialHours, null, 2, city, service));

    // Ongoing leg: the existing recurring flat price/hours (timeLowHrs is
    // the saved r.hours — actual cleaning+addon hours, never the +1hr
    // scheduling buffer in timeHighHrs), its own low end checked too.
    const ongoingHours = Number(q.timeLowHrs);
    const ongoingPrice = Number(q.suggested);
    const ongoingLow = q.low != null ? Number(q.low) : null;
    legs.push(evaluateLeg("ongoing", ongoingPrice, ongoingLow, ongoingHours, null, teamSize, city, service));

    // Correction round (Item 1): until the underlying cost inputs are
    // actually reconciled against real payroll/TCS/mileage records, EVERY
    // recurring Standard quote is held, unconditionally, on BOTH legs —
    // even when the provisional margin computed from these unverified costs
    // comes out comfortably above both the 10% floor and the 21% target.
    // The legs' real, genuine marginPct/floorPrice10 computed just above are
    // left completely untouched — describeMarginHold (below) reports them,
    // explicitly labeled "provisional", never hidden or zeroed. This branch
    // never runs for the "single"-leg path below (every other service, and
    // one-time Standard) — that path's behavior is byte-for-byte unchanged.
    if (!costDataVerified) {
      for (const leg of legs) {
        leg.held = true;
        leg.heldReason = "unverified-cost";
      }
    }
  } else {
    const hours = Number(q.timeLowHrs);
    const price = Number(q.suggested);
    const lowPrice = q.low != null ? Number(q.low) : null;
    const lowHours = q.lowHours != null ? Number(q.lowHours) : null;
    legs.push(evaluateLeg("single", price, lowPrice, hours, lowHours, teamSize, city, service));
  }

  const heldLegs = legs.filter((l) => l.held).map((l) => l.leg);
  return { held: heldLegs.length > 0, heldLegs, legs };
}

const LEG_LABELS: Record<QuoteLeg, string> = {
  single: "This quote",
  initial: "Initial Cleaning",
  ongoing: "Ongoing Cleaning",
};

// Builds the specific reason + minimum-price text shown ONLY to an ADMIN
// caller (never persisted in the quote row, never shown to a non-ADMIN —
// see the two routes that call this). Never labels anything "verified" —
// see this module's header / Item 4.
//
// Correction round (Item 1): a leg held for 'unverified-cost' gets its own,
// honest wording — it explicitly names the hold as a cost-data problem (not
// a margin problem), names the $20.52/hr overhead figure specifically, and
// reports the leg's real computed margin % and minimum price EXPLICITLY
// LABELED "provisional" (never claiming they're verified). A leg held for
// 'below-floor' (every other service, completely unaffected by this
// correction) keeps the exact wording it had before.
export function describeMarginHold(evaluation: QuoteMarginEvaluation): string {
  return evaluation.legs
    .filter((l) => l.held)
    .map((l) => {
      const floorText = Number.isFinite(l.floorPrice10) ? `$${l.floorPrice10.toFixed(0)}` : "unavailable";
      if (l.heldReason === "unverified-cost") {
        return (
          `${LEG_LABELS[l.leg]} is held because its underlying costs — including the ` +
          `$${AUDIT_OVERHEAD_PER_TECH_HR.toFixed(2)}/hr overhead figure — have not yet been reconciled against ` +
          `real payroll/TCS/mileage records. Provisional margin (based on unverified costs): ${l.marginPct.toFixed(1)}% ` +
          `(provisional minimum price ${floorText}).`
        );
      }
      return `${LEG_LABELS[l.leg]} is at ${l.marginPct.toFixed(1)}% margin — below the 10% floor (minimum price ${floorText}).`;
    })
    .join(" ");
}
