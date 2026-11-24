// The owner's "Completed cleaning charges" revenue entry — deliberately
// separate from labor (src/lib/salesDashboard.ts's setSalesLabor/
// getSalesActuals), from the real Financials monthly close (MonthlyFinancials,
// untouched by this file), and from the goal tracker's own current-month-only
// read (loadSalesDashboard always calls getSalesActuals() with no monthKey,
// so nothing here changes what it sees). A revenue snapshot is a *replacement*
// total for one reporting month — a full-month or month-to-date figure
// copied in from an outside source (e.g. a completed-jobs export), never an
// additive import — so saving the same figure twice, or re-saving a month
// a session already touched, can never double count: each save simply
// overwrites that month's one row.
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { zonedTimeToUtc } from "@/lib/timezone";
import type { RevenueCoverage, RevenueSnapshotStatus } from "@prisma/client";

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonthKey(key: string): boolean {
  return MONTH_KEY_RE.test(key);
}

// UTC-midnight-encoded first/last calendar day of an arbitrary YYYY-MM
// reporting month (not "now" — the owner picks the month explicitly, so
// this never needs a business-timezone "what day is it" conversion the
// way e.g. lastDayOfBusinessMonth does). monthKey is already validated by
// isValidMonthKey everywhere this is called from user input, so the month
// number here is always 01-12.
export function monthBoundsUtc(monthKey: string): { first: Date; last: Date } {
  const [y, m] = monthKey.split("-").map(Number);
  return {
    first: new Date(Date.UTC(y, m - 1, 1)),
    last: new Date(Date.UTC(y, m, 0)),
  };
}

// A plain decimal dollar amount: digits, an optional 1-2 decimal places,
// nothing else — no leading `+`/`-`, no exponent notation ("1e5"), no
// hex ("0x10"), no thousands separators, no surrounding text. `Number()`
// alone accepts all of those (and silently trims whitespace), which is
// exactly the kind of "JavaScript normalizes it into something that looks
// like a valid number" this guards against. Returns null, never NaN/
// Infinity/a coerced 0, for anything that isn't a clean match.
export function parseStrictMoney(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

// A calendar date's Y/M/D, rejecting anything JS's Date would otherwise
// silently roll over into a different, valid-looking date (e.g.
// "2026-02-30" normalizing into March 2) — the round-trip through
// Date.UTC must read back the exact same Y/M/D it was given.
function parseExactCalendarDate(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

// "YYYY-MM-DDTHH:mm" with a real calendar date and an in-range 24-hour
// time (00-23 / 00-59) — a bare date (no "T..:.."), a malformed time, or
// an out-of-range hour/minute like "25:99" are all rejected outright
// rather than letting Date.UTC roll an invalid time into a different,
// valid-looking instant. Returns the exact wall-clock parts, not a Date,
// so the caller converts them with zonedTimeToUtc only once they're known
// to be well-formed.
function parseExactLocalDateTime(
  raw: string
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (hour > 23 || minute > 59) return null;
  const datePart = new Date(Date.UTC(year, month - 1, day));
  if (datePart.getUTCFullYear() !== year || datePart.getUTCMonth() !== month - 1 || datePart.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day, hour, minute };
}

const VALID_COVERAGE = new Set(["FULL_MONTH", "MONTH_TO_DATE"]);
const VALID_STATUS = new Set(["PROVISIONAL", "RECONCILED"]);
const MAX_SOURCE_LENGTH = 200;

export interface RevenueSnapshotMeta {
  revenue: number;
  source: string;
  coverage: RevenueCoverage;
  coverageThrough: Date;
  sourceAsOf: Date;
  status: RevenueSnapshotStatus;
  enteredByName: string;
  updatedAt: Date;
}

// `null` for a month with nothing entered at all (new or legacy); a bare
// `{ legacyRevenue }` for a month entered before this snapshot model
// existed — read, never migrated or reclassified, so it has none of the
// source/coverage/as-of/status metadata a new-style entry does.
export type RevenueEntryForMonth =
  | { kind: "none" }
  | { kind: "legacy"; revenue: number }
  | ({ kind: "snapshot" } & RevenueSnapshotMeta);

export async function getRevenueEntryForMonth(monthKey: string): Promise<RevenueEntryForMonth> {
  const snapshot = await prisma.salesRevenueSnapshot.findUnique({
    where: { monthKey },
    include: { enteredBy: { select: { name: true } } },
  });
  if (snapshot) {
    return {
      kind: "snapshot",
      revenue: snapshot.revenue,
      source: snapshot.source,
      coverage: snapshot.coverage,
      coverageThrough: snapshot.coverageThrough,
      sourceAsOf: snapshot.sourceAsOf,
      status: snapshot.status,
      enteredByName: snapshot.enteredBy.name,
      updatedAt: snapshot.updatedAt,
    };
  }

  const legacyRow = await prisma.salesToolData.findUnique({ where: { key: `sales:actuals:${monthKey}` } });
  if (legacyRow) {
    try {
      const parsed = JSON.parse(legacyRow.value) as { revenue?: number };
      if (typeof parsed.revenue === "number") {
        return { kind: "legacy", revenue: parsed.revenue };
      }
    } catch {
      // Malformed legacy row — treat as nothing entered.
    }
  }
  return { kind: "none" };
}

export interface RawRevenueSnapshotInput {
  monthKey: string;
  revenue: string;
  source: string;
  coverage: string;
  coverageThrough: string; // "YYYY-MM-DD"
  sourceAsOf: string; // "YYYY-MM-DDTHH:mm" (business timezone, no offset)
  status: string;
  confirmStaleAsOf: boolean;
}

export type SaveRevenueSnapshotResult =
  | { ok: true }
  | { ok: false; code: "VALIDATION"; error: string }
  | { ok: false; code: "STALE_AS_OF"; error: string };

// Every field here is server-validated from scratch — this is a money
// figure the owner relies on, reached (in practice) only through an
// ADMIN-gated form, but never trusted just because the caller claims to be
// one. Nothing here is coerced to a fallback value: a blank, malformed,
// negative, or internally-inconsistent field is refused outright rather
// than silently turned into 0/"now"/some default, so a rejected save is
// never mistaken for a successful one that happened to record a zero.
export async function saveRevenueSnapshot(
  input: RawRevenueSnapshotInput,
  actorId: string
): Promise<SaveRevenueSnapshotResult> {
  const monthKey = input.monthKey.trim();
  if (!isValidMonthKey(monthKey)) {
    return { ok: false, code: "VALIDATION", error: "Reporting month must be a valid YYYY-MM value." };
  }

  const revenueRaw = input.revenue.trim();
  if (revenueRaw === "") {
    return { ok: false, code: "VALIDATION", error: "Revenue is required." };
  }
  const revenue = parseStrictMoney(revenueRaw);
  if (revenue === null) {
    return {
      ok: false,
      code: "VALIDATION",
      error: "Revenue must be a plain non-negative amount like 1234.56 — no hex, scientific notation, or other formats.",
    };
  }

  const source = input.source.trim();
  if (!source) {
    return { ok: false, code: "VALIDATION", error: "Source is required." };
  }
  if (source.length > MAX_SOURCE_LENGTH) {
    return { ok: false, code: "VALIDATION", error: `Source must be ${MAX_SOURCE_LENGTH} characters or fewer.` };
  }

  if (!VALID_COVERAGE.has(input.coverage)) {
    return { ok: false, code: "VALIDATION", error: "Coverage must be Full month or Month to date." };
  }
  const coverage = input.coverage as RevenueCoverage;

  if (!VALID_STATUS.has(input.status)) {
    return { ok: false, code: "VALIDATION", error: "Status must be Provisional or Reconciled." };
  }
  const status = input.status as RevenueSnapshotStatus;

  const coverageThroughRaw = input.coverageThrough.trim();
  if (!coverageThroughRaw) {
    return { ok: false, code: "VALIDATION", error: "Coverage-through date is required." };
  }
  const coverageThrough = parseExactCalendarDate(coverageThroughRaw);
  if (!coverageThrough) {
    return {
      ok: false,
      code: "VALIDATION",
      error: "Coverage-through date must be a real calendar date (e.g. not February 30th).",
    };
  }

  const { first, last } = monthBoundsUtc(monthKey);
  if (coverageThrough.getTime() < first.getTime() || coverageThrough.getTime() > last.getTime()) {
    return {
      ok: false,
      code: "VALIDATION",
      error: "Coverage-through date must fall within the selected reporting month.",
    };
  }
  if (coverage === "FULL_MONTH" && coverageThrough.getTime() !== last.getTime()) {
    return {
      ok: false,
      code: "VALIDATION",
      error: "Full month coverage must run through the last day of the reporting month.",
    };
  }
  if (coverage === "MONTH_TO_DATE" && coverageThrough.getTime() === last.getTime()) {
    return {
      ok: false,
      code: "VALIDATION",
      error: "Month-to-date coverage must end before the last day of the reporting month — use Full month for that.",
    };
  }

  const sourceAsOfRaw = input.sourceAsOf.trim();
  if (!sourceAsOfRaw) {
    return { ok: false, code: "VALIDATION", error: "Source as-of time is required." };
  }
  // Requires a full "YYYY-MM-DDTHH:mm" — a date-only value (no time at
  // all) is rejected rather than silently read as midnight, same as an
  // out-of-range hour/minute (e.g. "25:99") or a nonexistent calendar date.
  const sourceAsOfParts = parseExactLocalDateTime(sourceAsOfRaw);
  if (!sourceAsOfParts) {
    return {
      ok: false,
      code: "VALIDATION",
      error: "Source as-of must include both a real calendar date and a time (HH:mm), not a date alone.",
    };
  }
  const sourceAsOf = zonedTimeToUtc(sourceAsOfRaw);
  if (Number.isNaN(sourceAsOf.getTime())) {
    return { ok: false, code: "VALIDATION", error: "Source as-of time is invalid." };
  }

  // The source can't have been "as of" a moment before the period it's
  // reporting on even finishes — e.g. coverage through Nov 20 but the
  // source pulled Nov 18 is internally inconsistent, not just unusual.
  //
  // Compared as calendar dates in the business timezone (America/
  // Los_Angeles), not as raw UTC instants: source-as-of's Y/M/D is exactly
  // what the owner typed (already business-timezone wall clock, per this
  // field's own convention — see parseExactLocalDateTime above), while
  // coverage-through is itself a pure calendar date. Comparing UTC
  // instants instead would accept a source-as-of evening that hasn't
  // actually reached the next calendar day in Pacific time at all — e.g.
  // "Feb 1, 8pm Pacific" converts to "Feb 2, 4am UTC", which would wrongly
  // read as covering through Feb 2 even though its own Pacific calendar
  // date is still Feb 1.
  const sourceAsOfDateKey = `${sourceAsOfParts.year}-${String(sourceAsOfParts.month).padStart(2, "0")}-${String(sourceAsOfParts.day).padStart(2, "0")}`;
  if (sourceAsOfDateKey < coverageThroughRaw) {
    return {
      ok: false,
      code: "VALIDATION",
      error: "Source as-of's calendar date (America/Los_Angeles) must not be earlier than the coverage-through date.",
    };
  }

  const existing = await prisma.salesRevenueSnapshot.findUnique({ where: { monthKey } });

  // A backwards as-of update (this save's source data is OLDER than what's
  // already on file) needs an explicit confirmation rather than silently
  // replacing newer data with stale data — e.g. a correction being entered
  // out of order, or an older export accidentally re-uploaded.
  if (existing && sourceAsOf.getTime() < existing.sourceAsOf.getTime() && !input.confirmStaleAsOf) {
    return {
      ok: false,
      code: "STALE_AS_OF",
      error: `The figure on file is already as of ${existing.sourceAsOf.toISOString()}, which is newer than what you're entering (${sourceAsOf.toISOString()}). Confirm to replace it anyway.`,
    };
  }

  // When there's no new-style snapshot yet, the owner's last-seen figure
  // for this month may still be a legacy row's revenue (getSalesActuals
  // falls back to it) — the audit record's "from" should reflect that real
  // prior value, not read as if nothing had ever been entered. The legacy
  // row itself is only read here, never written to or migrated.
  let revenueBefore: number | undefined = existing?.revenue;
  if (!existing) {
    const legacyRow = await prisma.salesToolData.findUnique({ where: { key: `sales:actuals:${monthKey}` } });
    if (legacyRow) {
      try {
        const parsed = JSON.parse(legacyRow.value) as { revenue?: number };
        if (typeof parsed.revenue === "number") revenueBefore = parsed.revenue;
      } catch {
        // Malformed legacy row — no prior figure to attribute.
      }
    }
  }

  const changedFields: Record<string, { from?: unknown; to?: unknown }> = {
    revenue: { from: revenueBefore, to: revenue },
    source: { from: existing?.source, to: source },
    coverage: { from: existing?.coverage, to: coverage },
    coverageThrough: { from: existing?.coverageThrough?.toISOString(), to: coverageThrough.toISOString() },
    sourceAsOf: { from: existing?.sourceAsOf?.toISOString(), to: sourceAsOf.toISOString() },
    status: { from: existing?.status, to: status },
  };

  // The snapshot write and its audit entry are one transaction — a crash
  // or error between the two must never leave a successful save with no
  // change record (or an audit row describing a save that didn't happen).
  await prisma.$transaction(async (tx) => {
    await tx.salesRevenueSnapshot.upsert({
      where: { monthKey },
      create: { monthKey, revenue, source, coverage, coverageThrough, sourceAsOf, status, enteredById: actorId },
      update: { revenue, source, coverage, coverageThrough, sourceAsOf, status, enteredById: actorId },
    });

    // Small, owner-only change record — reporting month, old/new revenue
    // and metadata, actor, and save time. Never customer details or
    // payroll records, which this snapshot has none of to begin with.
    await logAudit(
      {
        actorId,
        action: existing ? "SALES_REVENUE_SNAPSHOT_UPDATED" : "SALES_REVENUE_SNAPSHOT_CREATED",
        recordType: "SalesRevenueSnapshot",
        recordId: monthKey,
        changedFields,
      },
      tx
    );
  });

  return { ok: true };
}
