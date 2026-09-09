import { prisma } from "@/lib/prisma";

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
  revenueRemaining: number;
  cleaningsNeeded: number;
  topOpportunities: SalesOpportunity[];
}

const GOAL_KEY = "sales:goal";

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

function isSameMonth(isoDate: string, now: Date): boolean {
  const d = new Date(isoDate);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export async function loadSalesDashboard(): Promise<SalesDashboard> {
  const [rows, goal] = await Promise.all([
    prisma.salesToolData.findMany({ where: { key: { startsWith: "quote:" } } }),
    getSalesGoal(),
  ]);

  const quotes: QuoteRecord[] = rows
    .map((row) => {
      try {
        return JSON.parse(row.value) as QuoteRecord;
      } catch {
        return null;
      }
    })
    .filter((q): q is QuoteRecord => q !== null);

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

  const revenueRemaining = Math.max(goal - wonRevenueThisMonth, 0);
  const cleaningsNeeded =
    revenueRemaining > 0 && averageJobValue ? Math.ceil(revenueRemaining / averageJobValue) : 0;

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

  return {
    goal,
    totalQuotes: quotes.length,
    pendingCount: pending.length,
    wonCount: won.length,
    lostCount: lost.length,
    winRate: decided > 0 ? won.length / decided : null,
    wonRevenueThisMonth,
    wonRevenueAllTime,
    averageJobValue,
    revenueRemaining,
    cleaningsNeeded,
    topOpportunities,
  };
}
