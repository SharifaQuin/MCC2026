import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, isAdminOrServiceManager } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasDepartmentAccess } from "@/lib/departments";
import { loadAdminDashboard } from "@/lib/dashboard";
import { loadRecruitingDashboard } from "@/lib/recruiting";
import { loadSalesDashboard } from "@/lib/salesDashboard";
import { getPendingOnboardingCount } from "@/lib/onboarding";
import { getLatestMonthlyFinancials, getTeamGoals, getChecklistTasksForRole, getOpenLoans } from "@/lib/financials";
import { reachedGrowthStages } from "@/lib/checklistDisplay";
import { estimateLoanPayoff } from "@/lib/loans";
import { getTodayCardData } from "@/lib/hrToday";
import { getAreaAccessForUser } from "@/lib/officeAssistant";
import ChecklistSidebar from "@/components/ChecklistSidebar";
import TodayCard from "./TodayCard";
import RookieJourneyHome from "./RookieJourneyHome";
import TraineeHome from "./TraineeHome";
import TrainerHome from "./TrainerHome";
import { getTrainingExperienceVersion } from "@/lib/rookieJourney";

function Stat({
  label,
  value,
  href,
  caption,
}: {
  label: string;
  value: number | string;
  href?: string;
  caption?: React.ReactNode;
}) {
  const content = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-neutral-900">{value}</p>
      {caption && <p className="mt-0.5 text-xs text-neutral-500">{caption}</p>}
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
  if (session.role === "TRAINER") return <TrainerHome session={session} />;
  if (session.role === "TRAINEE") {
    const pending = await getPendingOnboardingCount(session.sub);
    if (pending > 0) redirect("/documents");
    const trainingVersion = await getTrainingExperienceVersion();
    return trainingVersion === "classic" ? (
      <TraineeHome session={session} />
    ) : (
      <RookieJourneyHome session={session} />
    );
  }

  const grants = await prisma.departmentAccess.findMany({
    where: { userId: session.sub },
    select: { department: true, canEdit: true },
  });
  const hasSalesAccess = hasDepartmentAccess(session.role, grants, "SALES").canView;
  // A Sales Rep's account is sales-only — her landing page is the Sales
  // dashboard itself, not this cross-department HR-labeled Home — but only
  // once she actually has real Sales access; redirecting her there
  // unconditionally would loop forever against /sales's own identical
  // requireDepartmentAccess("SALES") redirect-to-"/" for an unconfigured
  // account that doesn't have it yet. Without it, she falls through to the
  // generic Home body below, which already hides every section she
  // shouldn't see (Sales/Goals/Training/Recruiting all gate on flags that
  // are false for her here).
  if (session.role === "SALES_REP" && hasSalesAccess) redirect("/sales");
  const isAdmin = session.role === "ADMIN";
  const isOfficeAssistant = session.role === "OFFICE_ASSISTANT";
  // Reachable here only when she has no Sales access yet (see the redirect
  // above) — a sales-only account with an unconfigured grant should still
  // never see or trigger a query for HR/recruiting/training content.
  const isSalesRep = session.role === "SALES_REP";
  // Goals (getTeamGoals) is ADMIN/SERVICE_MANAGER only (requireManagementAccess)
  // — matches that function's own real authorization boundary exactly, so
  // every role this general Home branch is ever reached by (currently ADMIN,
  // SERVICE_MANAGER, OFFICE_ASSISTANT, SALES_REP — TRAINEE/TRAINER return
  // earlier above) is handled correctly without special-casing each one by
  // name as a new role is added.
  const canViewGoals = isAdminOrServiceManager(session.role);
  // Home shows cross-department $ figures (Goals) and HR headline counts
  // (Training/Recruiting) that no other non-admin role sees today — gate
  // both behind this role's own HR_SUMMARY grant rather than leaving them
  // open the way they already are for SERVICE_MANAGER/ADMIN.
  const canViewHrSummary = isOfficeAssistant
    ? (await getAreaAccessForUser(session.sub, "HR_SUMMARY")).canView
    : !isSalesRep;
  // The Training card's own button is gated by the Training area grant
  // specifically, independent of HR_SUMMARY above — an Office Assistant can
  // have HR Summary access without Training access, or vice versa, and the
  // button here must only ever offer what that specific grant allows.
  const canViewTrainingModules = isOfficeAssistant
    ? (await getAreaAccessForUser(session.sub, "TRAINING")).canView
    : true;
  // Matches middleware.ts's own /staff/payroll gate — a SERVICE_MANAGER can
  // already open the full payroll page, so the Today card's payroll section
  // shouldn't be stricter than the page it links to.
  const canViewPayroll = isAdminOrServiceManager(session.role);
  // Office Assistant's Home checklist must honor the same owner-configured
  // ASSIGNED_TASKS grant /todo already enforces: None means the query is
  // skipped outright (no task text/notes ever leave the server), View means
  // read-only, Edit means the usual controls. No other role has this extra
  // area-access layer, so they're always fully view+edit here.
  const assignedTasksAccess = isOfficeAssistant
    ? await getAreaAccessForUser(session.sub, "ASSIGNED_TASKS")
    : { canView: true, canEdit: true };

  const [training, recruiting, sales, latestFinancials, teamGoals, checklistTasks, openLoans, todayCard] =
    await Promise.all([
      isSalesRep ? Promise.resolve(null) : loadAdminDashboard(),
      isSalesRep ? Promise.resolve(null) : loadRecruitingDashboard(),
      hasSalesAccess ? loadSalesDashboard(isAdmin) : Promise.resolve(null),
      isAdmin ? getLatestMonthlyFinancials() : Promise.resolve(null),
      // The Goals section that uses this is hidden outright for anyone this
      // isn't true for (see canViewGoals above) — skip the call entirely
      // rather than let it throw.
      canViewGoals ? getTeamGoals() : Promise.resolve({} as Record<string, unknown>),
      assignedTasksAccess.canView
        ? getChecklistTasksForRole(session.role, isAdmin ? undefined : session.sub)
        : Promise.resolve([]),
      isAdmin ? getOpenLoans() : Promise.resolve([]),
      getTodayCardData({ isAdmin, hasSalesAccess, canViewPayroll, isSalesRep }),
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

  // Shared between the Sales section's header badge (unchanged) and the
  // Monthly Goal Stat tile's new caption — same data already computed here,
  // no new computation.
  const salesGoalHit = !!sales && sales.goal > 0 && sales.revenueTowardGoal >= sales.goal;
  const salesGoalProgressText = sales
    ? salesGoalHit
      ? "Goal hit this month! 🎉"
      : `${money(sales.revenueRemaining)} to hit this month's goal`
    : "";

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
        <div className="min-w-0 space-y-6">
          <TodayCard
            data={todayCard}
            isAdmin={isAdmin}
            hasSalesAccess={hasSalesAccess}
            canViewPayroll={canViewPayroll}
            isSalesRep={isSalesRep}
          />

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

          {canViewGoals && (
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
          )}

          {sales && (
            <section className="rounded-lg border border-neutral-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-neutral-900">Sales</h2>
                {sales.goal > 0 && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      salesGoalHit ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {salesGoalProgressText}
                  </span>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
                <Stat
                  label={sales.actuals.entered ? "Actual Revenue" : "Won This Month"}
                  value={money(sales.revenueTowardGoal)}
                  href="/sales/quotes?status=won"
                />
                <Stat
                  label="Monthly Goal"
                  value={sales.goal > 0 ? money(sales.goal) : "Not set"}
                  caption={sales.goal > 0 ? salesGoalProgressText : undefined}
                />
                <Stat
                  label="Cleanings Needed"
                  value={
                    sales.goal > 0 && sales.revenueTowardGoal < sales.goal
                      ? String(sales.cleaningsNeeded)
                      : "0"
                  }
                />
                {isAdmin && (
                  <Stat
                    label="Profit So Far"
                    value={sales.actuals.entered && sales.actuals.profit !== null ? money(sales.actuals.profit) : "—"}
                  />
                )}
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

          {canViewHrSummary && training && recruiting && (
          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-lg border border-neutral-200 bg-white p-6">
              <h2 className="text-lg font-medium text-neutral-900">Training</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Onboarding, modules, certification, and field evaluations.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat
                  label="Total Employees"
                  value={training.totalEmployees}
                  href={isOfficeAssistant ? undefined : "/admin/employees"}
                />
                <Stat
                  label="In Training"
                  value={training.inTraining}
                  href={isOfficeAssistant ? undefined : "/admin/employees?status=ACTIVE"}
                />
                <Stat
                  label="Completed All Training"
                  value={training.completedAll}
                  href={isOfficeAssistant ? undefined : "/admin/employees?status=COMPLETED_ALL"}
                />
                <Stat
                  label="Pending Certification"
                  value={training.pendingCertifications.length}
                  href={isOfficeAssistant ? undefined : "/admin/employees?status=PENDING_CERT"}
                />
              </div>
              {isOfficeAssistant ? (
                canViewTrainingModules && (
                  <Link
                    href="/modules"
                    className="mt-5 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    View Training Modules
                  </Link>
                )
              ) : (
                <Link
                  href="/admin"
                  className="mt-5 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  View Training Dashboard
                </Link>
              )}
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
          )}
        </div>

        <aside className="min-w-0 lg:sticky lg:top-28">
          <ChecklistSidebar items={checklistItems} isAdmin={isAdmin} canEditTasks={assignedTasksAccess.canEdit} />
        </aside>
      </div>
    </div>
  );
}
