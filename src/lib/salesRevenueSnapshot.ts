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
// way e.g. lastDayOfBusinessMonth does).
export function monthBoundsUtc(monthKey: string): { first: Date; last: Date } {
  const [y, m] = monthKey.split("-").map(Number);
  return {
    first: new Date(Date.UTC(y, m - 1, 1)),
    last: new Date(Date.UTC(y, m, 0)),
  };
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
  const revenue = Number(revenueRaw);
  if (!Number.isFinite(revenue) || revenue < 0) {
    return { ok: false, code: "VALIDATION", error: "Revenue must be a non-negative number." };
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(coverageThroughRaw)) {
    return { ok: false, code: "VALIDATION", error: "Coverage-through date is required." };
  }
  const coverageThrough = new Date(`${coverageThroughRaw}T00:00:00Z`);
  if (Number.isNaN(coverageThrough.getTime())) {
    return { ok: false, code: "VALIDATION", error: "Coverage-through date is invalid." };
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
  let sourceAsOf: Date;
  try {
    sourceAsOf = zonedTimeToUtc(sourceAsOfRaw);
  } catch {
    return { ok: false, code: "VALIDATION", error: "Source as-of time is invalid." };
  }
  if (Number.isNaN(sourceAsOf.getTime())) {
    return { ok: false, code: "VALIDATION", error: "Source as-of time is invalid." };
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

  const changedFields: Record<string, { from?: unknown; to?: unknown }> = {
    revenue: { from: existing?.revenue, to: revenue },
    source: { from: existing?.source, to: source },
    coverage: { from: existing?.coverage, to: coverage },
    coverageThrough: { from: existing?.coverageThrough?.toISOString(), to: coverageThrough.toISOString() },
    sourceAsOf: { from: existing?.sourceAsOf?.toISOString(), to: sourceAsOf.toISOString() },
    status: { from: existing?.status, to: status },
  };

  await prisma.salesRevenueSnapshot.upsert({
    where: { monthKey },
    create: { monthKey, revenue, source, coverage, coverageThrough, sourceAsOf, status, enteredById: actorId },
    update: { revenue, source, coverage, coverageThrough, sourceAsOf, status, enteredById: actorId },
  });

  // Small, owner-only change record — reporting month, old/new revenue and
  // metadata, actor, and save time. Never customer details or payroll
  // records, which this snapshot has none of to begin with.
  await logAudit({
    actorId,
    action: existing ? "SALES_REVENUE_SNAPSHOT_UPDATED" : "SALES_REVENUE_SNAPSHOT_CREATED",
    recordType: "SalesRevenueSnapshot",
    recordId: monthKey,
    changedFields,
  });

  return { ok: true };
}
