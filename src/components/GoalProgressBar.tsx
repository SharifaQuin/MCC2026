import type { SessionPayload } from "@/lib/session";
import type { AccessibleDepartment } from "@/lib/departments";
import { loadSalesDashboard } from "@/lib/salesDashboard";
import { getLatestMonthlyFinancials, getTeamGoals } from "@/lib/financials";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

// Pinned under the Nav on every page (see the shared portal layout) so the
// two numbers she most wants to always have in view — this month's sales
// goal, and how close revenue is to the next growth-stage milestone — never
// require a click to check. Growth-stage math is ADMIN-only since it's
// derived from actual revenue, which management never sees a raw figure of.
export default async function GoalProgressBar({
  session,
  departments,
}: {
  session: SessionPayload;
  departments: AccessibleDepartment[];
}) {
  if (session.role !== "ADMIN" && session.role !== "SERVICE_MANAGER") return null;

  const isAdmin = session.role === "ADMIN";
  const hasSalesAccess = departments.some((d) => d.department === "SALES");

  const [sales, teamGoals, latestFinancials] = await Promise.all([
    hasSalesAccess ? loadSalesDashboard() : Promise.resolve(null),
    isAdmin ? getTeamGoals() : Promise.resolve(null),
    isAdmin ? getLatestMonthlyFinancials() : Promise.resolve(null),
  ]);

  const staircase = (teamGoals?.growth_staircase_monthly_revenue as number[] | undefined) ?? [];
  const nextStage =
    isAdmin && latestFinancials ? staircase.find((amount) => amount > latestFinancials.revenueTotal) : undefined;

  const showSales = sales && sales.goal > 0;
  const showStage = isAdmin && latestFinancials && nextStage !== undefined;

  if (!showSales && !showStage) return null;

  return (
    <div className="border-b border-neutral-200 bg-brand-50">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 text-xs">
        {showSales && sales && (
          <span className="font-medium text-neutral-700">
            Monthly goal: {money(sales.revenueTowardGoal)} / {money(sales.goal)}
            {sales.revenueTowardGoal >= sales.goal ? (
              <span className="ml-1 text-green-700">Hit! 🎉</span>
            ) : (
              <span className="ml-1 text-neutral-500">({money(sales.revenueRemaining)} to go)</span>
            )}
          </span>
        )}
        {showStage && latestFinancials && nextStage !== undefined && (
          <span className="text-neutral-600">
            Next growth stage: {money(nextStage - latestFinancials.revenueTotal)} to {money(nextStage)}/mo
          </span>
        )}
      </div>
    </div>
  );
}
