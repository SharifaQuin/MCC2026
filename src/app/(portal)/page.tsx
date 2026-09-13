import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasDepartmentAccess } from "@/lib/departments";
import { loadAdminDashboard } from "@/lib/dashboard";
import { loadRecruitingDashboard } from "@/lib/recruiting";
import { loadSalesDashboard } from "@/lib/salesDashboard";
import { getPendingOnboardingCount } from "@/lib/onboarding";
import { getLatestMonthlyFinancials, getTeamGoals, getChecklistTasksForRole, getOpenLoans } from "@/lib/financials";
import { reachedGrowthStages } from "@/lib/checklistDisplay";
import { estimateLoanPayoff } from "@/lib/loans";
import ChecklistSidebar from "@/components/ChecklistSidebar";

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const content = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-neutral-900">{value}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="block rounded-md bg-neutral-50 p-3 hover:bg-neutral-100">
        {content}
      </Link>
    );
  }
  return <div className="rounded-md bg-neutral-50 p-3">{content}</div>;
}

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The real "home" landing page — reached via the logo. This is the only
// place the cross-department KPI overview (Sales + Training + Recruiting)
// shows up; the HR nav tab goes to a leaner, HR-only /hr page instead.
export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "TRAINER") redirect("/trainer/employees");
  if (session.role === "TRAINEE") {
    const pending = await getPendingOnboardingCount(session.sub);
    redirect(pending > 0 ? "/documents" : "/modules");
  }

  const grants = await prisma.departmentAccess.findMany({
    where: { userId: session.sub },
    select: { department: true, canEdit: true },
  });
  const hasSalesAccess = hasDepartmentAccess(session.role, grants, "SALES").canView;
  const isAdmin = session.role === "ADMIN";

  const [training, recruiting, sales, latestFinancials, teamGoals, checklistTasks, openLoans] = await Promise.all([
    loadAdminDashboard(),
    loadRecruitingDashboard(),
    hasSalesAccess ? loadSalesDashboard() : Promise.resolve(null),
    isAdmin ? getLatestMonthlyFinancials() : Promise.resolve(null),
    getTeamGoals(),
    getChecklistTasksForRole(session.role),
    isAdmin ? getOpenLoans() : Promise.resolve([]),
  ]);

  const growthStaircase = (teamGoals.growth_staircase_monthly_revenue as number[] | undefined) ?? [];
  const currentStageStatus = teamGoals.current_stage_status as string | undefined;
  const profitabilityGoal = teamGoals.profitability_goal as string | undefined;
  const marketingBudgetMonthly = teamGoals.marketing_budget_monthly as number | undefined;
  const marketingBudgetNote = teamGoals.marketing_budget_note as string | undefined;

  // Only computed for the owner — management never gets the revenue figure
  // this comparison is based on, just the plain stage list as before.
  const reachedStages =
    isAdmin && latestFinancials ? reachedGrowthStages(growthStaircase, latestFinancials.revenueTotal) : null;

  const checklistItems = checklistTasks.map((t) => ({
    id: t.id,
    frequency: t.frequency,
    task: t.task,
    effectiveStatus: t.effectiveStatus,
    category: t.category,
    notes: t.notes,
    targetDate: t.targetDate ? t.targetDate.toISOString() : null,
    dueFridayOfWeek: t.dueFridayOfWeek,
  }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Home</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
        <div className="space-y-6">
          {isAdmin && latestFinancials && (
            <section className="rounded-lg border border-neutral-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-neutral-900">
                  Financial Overview — {latestFinancials.monthLabel} {latestFinancials.month.slice(0, 4)}
                </h2>
                <Link href="/financials" className="text-sm text-brand-700 hover:underline">
                  View full Financials →
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Revenue" value={money(latestFinancials.revenueTotal)} />
                <Stat label="Net Profit" value={money(latestFinancials.netProfit)} />
                <Stat label="Net Margin" value={`${(latestFinancials.netMarginPct * 100).toFixed(1)}%`} />
                <Stat label="Variance to Target" value={money(latestFinancials.varianceToTarget)} />
                <Stat label="Owner Draw" value={money(latestFinancials.ownerDraw)} />
                <Stat label="Ending Bank Balance" value={money(latestFinancials.endingBankBalance)} />
              </div>
            </section>
          )}

          {isAdmin && openLoans.length > 0 && (
            <section className="rounded-lg border border-neutral-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-neutral-900">Loans</h2>
                <Link href="/financials" className="text-sm text-brand-700 hover:underline">
                  Manage loans →
                </Link>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {openLoans.map((loan) => {
                  const payoff = estimateLoanPayoff({
                    currentBalance: loan.currentBalance,
                    minimumPayment: loan.minimumPayment,
                    minimumPaymentFrequency: loan.minimumPaymentFrequency,
                  });
                  return (
                    <div key={loan.id} className="rounded-md bg-neutral-50 p-3">
                      <p className="text-sm font-medium text-neutral-900">{loan.lender}</p>
                      <p className="mt-0.5 text-lg font-semibold text-neutral-900">
                        {loan.currentBalance !== null ? money(loan.currentBalance) : "—"}
                        <span className="ml-1 text-xs font-normal text-neutral-500">owed</span>
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {payoff && payoff.periodsRemaining > 0
                          ? `Est. payoff ${payoff.expectedPayoffDate.toLocaleDateString()}`
                          : payoff && payoff.periodsRemaining === 0
                            ? "Paid off"
                            : "Add a payment amount to estimate payoff"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="rounded-lg border border-neutral-200 bg-white p-6">
            <h2 className="text-lg font-medium text-neutral-900">Goals</h2>
            {growthStaircase.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {growthStaircase.map((amount, i) => {
                  const reached = reachedStages?.[i] ?? false;
                  return (
                    <span
                      key={i}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        reached ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      Stage {i + 1}: ${amount.toLocaleString()}/mo{reached ? " ✓" : ""}
                    </span>
                  );
                })}
              </div>
            )}
            {currentStageStatus && <p className="mt-3 text-sm text-neutral-600">{currentStageStatus}</p>}
            {profitabilityGoal && <p className="mt-1 text-sm text-neutral-500">{profitabilityGoal}</p>}
            {marketingBudgetMonthly !== undefined && (
              <p className="mt-3 text-sm text-neutral-600">
                Marketing budget: <span className="font-medium">{money(marketingBudgetMonthly)}/mo</span>
              </p>
            )}
            {marketingBudgetNote && <p className="mt-1 text-xs text-neutral-400">{marketingBudgetNote}</p>}
          </section>

          {sales && (
            <section className="rounded-lg border border-neutral-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-neutral-900">Sales</h2>
                {sales.goal > 0 && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      sales.revenueTowardGoal >= sales.goal
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {sales.revenueTowardGoal >= sales.goal
                      ? "Goal hit this month! 🎉"
                      : `${money(sales.revenueRemaining)} to hit this month's goal`}
                  </span>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
                <Stat
                  label={sales.actuals.entered ? "Actual Revenue" : "Won This Month"}
                  value={money(sales.revenueTowardGoal)}
                  href="/sales/quotes?status=won"
                />
                <Stat label="Monthly Goal" value={sales.goal > 0 ? money(sales.goal) : "Not set"} />
                <Stat
                  label="Cleanings Needed"
                  value={
                    sales.goal > 0 && sales.revenueTowardGoal < sales.goal
                      ? String(sales.cleaningsNeeded)
                      : "0"
                  }
                />
                <Stat label="Profit So Far" value={sales.actuals.entered ? money(sales.actuals.profit) : "—"} />
                <Stat label="Pending Quotes" value={sales.pendingCount} href="/sales/quotes?status=pending" />
                <Stat
                  label="Win Rate"
                  value={sales.winRate === null ? "—" : `${Math.round(sales.winRate * 100)}%`}
                />
              </div>
              <Link href="/sales" className="mt-5 inline-block text-sm text-brand-700 hover:underline">
                View full Sales dashboard →
              </Link>
            </section>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-lg border border-neutral-200 bg-white p-6">
              <h2 className="text-lg font-medium text-neutral-900">Training</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Onboarding, modules, certification, and field evaluations.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat label="Total Employees" value={training.totalEmployees} href="/admin/employees" />
                <Stat label="In Training" value={training.inTraining} href="/admin/employees?status=ACTIVE" />
                <Stat
                  label="Completed All Training"
                  value={training.completedAll}
                  href="/admin/employees?status=COMPLETED_ALL"
                />
                <Stat
                  label="Pending Certification"
                  value={training.pendingCertifications.length}
                  href="/admin/employees?status=PENDING_CERT"
                />
              </div>
              <Link
                href="/admin"
                className="mt-5 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                View Training Dashboard
              </Link>
            </section>

            <section className="rounded-lg border border-neutral-200 bg-white p-6">
              <h2 className="text-lg font-medium text-neutral-900">Recruiting</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Job postings, applicants, and the hiring pipeline.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat label="Active Applicants" value={recruiting.active} href="/recruiting" />
                <Stat label="Interviews Scheduled" value={recruiting.scheduledInterviews} href="/recruiting" />
                <Stat
                  label="Awaiting Scheduling"
                  value={recruiting.awaitingScheduling}
                  href="/recruiting/applicants?stage=PRESCREEN_PASSED"
                />
                <Stat label="Hired" value={recruiting.hired} href="/recruiting/applicants?stage=HIRED" />
              </div>
              <Link
                href="/recruiting"
                className="mt-5 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                View Recruiting Pipeline
              </Link>
            </section>
          </div>
        </div>

        <aside className="lg:sticky lg:top-28">
          <ChecklistSidebar items={checklistItems} isAdmin={isAdmin} />
        </aside>
      </div>
    </div>
  );
}
