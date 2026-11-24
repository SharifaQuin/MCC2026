import { prisma } from "@/lib/prisma";
import { businessMonthKey } from "@/lib/timezone";

const SERVICE_LABELS: Record<string, string> = {
  standard: "Standard Clean",
  alacarte: "A la Carte",
  deep: "Top to Bottom Deep Clean",
  movein: "Move In / Move Out",
  construction: "Post Construction",
  housekeeping: "Housekeeping",
  airbnb: "Airbnb Turnover",
};

interface QuoteRecord {
  id: string;
  clientName?: string;
  city?: string;
  service?: string;
  suggested?: string;
  status?: "pending" | "won" | "lost";
  savedAt?: string;
  wonAt?: string | null;
}

export interface SalesOpportunity {
  id: string;
  clientName: string;
  city: string;
  service: string;
  value: number;
}

export interface SalesActuals {
  revenue: number;
  labor: number | null; // null for a non-admin caller — owner-only, never computed for them
  profit: number | null; // null for a non-admin caller — derived from labor, same boundary
  entered: boolean; // false until she's actually entered a figure this month
  // How many cleanings this month's revenue figure covers — only ever
  // known from a new-style SalesRevenueSnapshot that was saved with a
  // count; null for a legacy-only month, a month with nothing entered, or
  // any snapshot saved without one. Null for a non-admin caller, same
  // boundary as labor/profit. Never inferred or backfilled.
  completedCleaningCount: number | null;
}

export interface SalesDashboard {
  goal: number;
  totalQuotes: number;
  pendingCount: number;
  wonCount: number;
  lostCount: number;
  winRate: number | null; // won / (won + lost), null if no decided quotes yet
  wonRevenueThisMonth: number;
  wonRevenueAllTime: number;
  averageJobValue: number | null;
  actuals: SalesActuals;
  // Revenue used for the goal tracker below: her manually-entered actual
  // revenue once she's entered one this month, otherwise the quote-based
  // estimate (wonRevenueThisMonth) so the tracker isn't blank early on.
  revenueTowardGoal: number;
  revenueRemaining: number;
  // null ("not enough data") whenever it can't be honestly computed — see
  // computeCleaningsNeeded below. Never substitutes won-quote pricing or
  // any other assumed cleaning price.
  cleaningsNeeded: number | null;
  topOpportunities: SalesOpportunity[];
}

const GOAL_KEY = "sales:goal";

function actualsKey(monthKey: string): string {
  return `sales:actuals:${monthKey}`;
}

export async function getSalesGoal(): Promise<number> {
  const row = await prisma.salesToolData.findUnique({ where: { key: GOAL_KEY } });
  if (!row) return 0;
  try {
    const parsed = JSON.parse(row.value) as { revenueGoal?: number };
    return typeof parsed.revenueGoal === "number" && parsed.revenueGoal >= 0 ? parsed.revenueGoal : 0;
  } catch {
    return 0;
  }
}

export async function setSalesGoal(revenueGoal: number): Promise<void> {
  await prisma.salesToolData.upsert({
    where: { key: GOAL_KEY },
    create: { key: GOAL_KEY, value: JSON.stringify({ revenueGoal }) },
    update: { value: JSON.stringify({ revenueGoal }) },
  });
}

// Revenue ("Completed cleaning charges") and labor are deliberately read
// from two different stores, and have been since the revenue-entry rework
// in src/lib/salesRevenueSnapshot.ts:
//  - Revenue prefers the new, structured SalesRevenueSnapshot row for this
//    month; if none exists yet, it falls back to this same legacy
//    SalesToolData row's `revenue` field (a month entered before that
//    rework, never migrated or reclassified — just read as-is).
//  - Labor always comes from this legacy-named SalesToolData row's `labor`
//    field, written only by setSalesLabor below, completely independent of
//    whatever the revenue side is doing — a revenue-only save can never
//    see or touch this field, by construction, not just by convention.
// `labor` is null (not 0) whenever that field is genuinely absent — a
// month where labor was never entered reads as unknown, never as zero;
// an explicitly-saved 0 round-trips as 0, same as any other real figure.
export async function getSalesActuals(monthKey: string = businessMonthKey()): Promise<SalesActuals> {
  const [snapshot, legacyRow] = await Promise.all([
    prisma.salesRevenueSnapshot.findUnique({ where: { monthKey } }),
    prisma.salesToolData.findUnique({ where: { key: actualsKey(monthKey) } }),
  ]);

  let revenue = 0;
  let entered = false;
  let completedCleaningCount: number | null = null;
  if (snapshot) {
    revenue = snapshot.revenue;
    entered = true;
    completedCleaningCount = snapshot.completedCleaningCount;
  } else if (legacyRow) {
    try {
      const parsed = JSON.parse(legacyRow.value) as { revenue?: number };
      if (typeof parsed.revenue === "number") {
        revenue = parsed.revenue;
        entered = true;
      }
    } catch {
      // Malformed legacy row — read as "nothing entered", never throws.
    }
  }

  let labor: number | null = null;
  if (legacyRow) {
    try {
      const parsed = JSON.parse(legacyRow.value) as { labor?: number };
      if (typeof parsed.labor === "number") labor = parsed.labor;
    } catch {
      // Malformed — labor stays unknown rather than guessed at.
    }
  }

  const profit = labor !== null ? revenue - labor : null;
  return { revenue, labor, profit, entered, completedCleaningCount };
}

// "Cleanings Needed" is strictly derived from THIS month's own entered
// Completed Cleaning Charges figure and its own completed-cleaning count
// — never from won-quote pricing (that's the separate, unrelated "Avg.
// Job Value" tile). Returns null ("not enough data") rather than guessing
// whenever an honest estimate isn't possible: no goal set, nothing
// entered this month, or no positive average cleaning price can be
// derived (count missing/zero, or revenue not positive) — EXCEPT that an
// already-met-or-exceeded goal reads as exactly 0 regardless, since no
// average is needed to know zero more cleanings are required. Full
// precision is kept throughout; only the final count is rounded (up).
export function computeCleaningsNeeded(
  goal: number,
  actuals: Pick<SalesActuals, "revenue" | "entered" | "completedCleaningCount">
): number | null {
  if (!(goal > 0)) return null;
  if (!actuals.entered) return null;

  const remaining = Math.max(goal - actuals.revenue, 0);
  if (remaining === 0) return 0;

  const count = actuals.completedCleaningCount;
  if (count === null || count <= 0 || actuals.revenue <= 0) return null;
  const averagePrice = actuals.revenue / count;
  if (!Number.isFinite(averagePrice) || averagePrice <= 0) return null;

  return Math.ceil(remaining / averagePrice);
}

// Merges `labor` into whatever's already stored under this month's legacy
// key, rather than replacing the row outright — so a labor-only save can
// never drop a legacy month's `revenue` field (still read as the fallback
// above) any more than a revenue save can touch labor. `labor` may be 0;
// that's a real entered value, distinct from the field being absent.
export async function setSalesLabor(labor: number, monthKey: string = businessMonthKey()): Promise<void> {
  const key = actualsKey(monthKey);
  const existing = await prisma.salesToolData.findUnique({ where: { key } });
  let merged: Record<string, unknown> = {};
  if (existing) {
    try {
      merged = JSON.parse(existing.value) as Record<string, unknown>;
    } catch {
      merged = {};
    }
  }
  merged.labor = labor;
  await prisma.salesToolData.upsert({
    where: { key },
    create: { key, value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  });
}

function isSameMonth(isoDate: string, now: Date): boolean {
  const d = new Date(isoDate);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export async function loadSalesDashboard(isAdmin: boolean = false): Promise<SalesDashboard> {
  const [rows, goal, actuals, scamLeads] = await Promise.all([
    prisma.salesToolData.findMany({ where: { key: { startsWith: "quote:" } } }),
    getSalesGoal(),
    getSalesActuals(),
    // Quotes have no leadId of their own — the link is Lead.quoteKey, which
    // stores the same string as a quote's own `id`. Building this Set lets
    // every aggregate below exclude a scam-linked quote WITHOUT touching
    // the quote's own saved `status` field at all.
    prisma.lead.findMany({ where: { stage: "SCAM", quoteKey: { not: null } }, select: { quoteKey: true } }),
  ]);
  const scamQuoteKeys = new Set(scamLeads.map((l) => l.quoteKey).filter((k): k is string => k != null));

  const allQuotes: QuoteRecord[] = rows
    .map((row) => {
      try {
        return JSON.parse(row.value) as QuoteRecord;
      } catch {
        return null;
      }
    })
    .filter((q): q is QuoteRecord => q !== null);

  // A malformed/missing quoteKey link (q.id absent or not in the Set) is
  // just treated as "no linked lead to exclude" — never throws.
  const quotes = allQuotes.filter((q) => !q.id || !scamQuoteKeys.has(q.id));

  const now = new Date();
  const won = quotes.filter((q) => q.status === "won");
  const lost = quotes.filter((q) => q.status === "lost");
  const pending = quotes.filter((q) => (q.status || "pending") === "pending");

  const wonValue = (q: QuoteRecord) => parseFloat(q.suggested || "0") || 0;

  const wonRevenueAllTime = won.reduce((sum, q) => sum + wonValue(q), 0);
  const wonRevenueThisMonth = won
    .filter((q) => q.wonAt && isSameMonth(q.wonAt, now))
    .reduce((sum, q) => sum + wonValue(q), 0);

  // Average job value: prefer this month's won jobs, fall back to all-time
  // won jobs, then to all quotes ever saved, so a brand-new month with no
  // wins yet still gets a usable estimate.
  const wonThisMonth = won.filter((q) => q.wonAt && isSameMonth(q.wonAt, now));
  const averageSource = wonThisMonth.length ? wonThisMonth : won.length ? won : quotes;
  const averageJobValue = averageSource.length
    ? averageSource.reduce((sum, q) => sum + wonValue(q), 0) / averageSource.length
    : null;

  const revenueTowardGoal = actuals.entered ? actuals.revenue : wonRevenueThisMonth;
  const revenueRemaining = Math.max(goal - revenueTowardGoal, 0);
  const cleaningsNeeded = computeCleaningsNeeded(goal, actuals);

  const topOpportunities: SalesOpportunity[] = pending
    .map((q) => ({
      id: q.id,
      clientName: q.clientName || "(no name)",
      city: q.city || "—",
      service: SERVICE_LABELS[q.service || ""] || q.service || "—",
      value: wonValue(q),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const decided = won.length + lost.length;

  // Labor/profit are owner-only: never included in the object handed back
  // to a non-admin caller at all, not just hidden by the page's rendering —
  // the RSC payload for a non-admin viewer must never carry these numbers.
  const scopedActuals: SalesActuals = isAdmin
    ? actuals
    : {
        revenue: actuals.revenue,
        labor: null,
        profit: null,
        entered: actuals.entered,
        completedCleaningCount: null,
      };

  return {
    goal,
    // Judgment call, flagged explicitly rather than assumed silently: the
    // brief's win/loss exclusion requirement names won/lost/winRate/
    // wonRevenue*/averageJobValue specifically, but totalQuotes/
    // pendingCount/topOpportunities (a different kind of figure — open-
    // pipeline/quote-count, not win/loss) are excluded here too, since
    // showing a known-scam contact as a "top opportunity" to chase seems
    // like the bigger risk than a lower quote count.
    totalQuotes: quotes.length,
    pendingCount: pending.length,
    wonCount: won.length,
    lostCount: lost.length,
    winRate: decided > 0 ? won.length / decided : null,
    wonRevenueThisMonth,
    wonRevenueAllTime,
    averageJobValue,
    actuals: scopedActuals,
    revenueTowardGoal,
    revenueRemaining,
    cleaningsNeeded,
    topOpportunities,
  };
}
