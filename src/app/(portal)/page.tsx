import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, isAdminOrServiceManager } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasDepartmentAccess, resolveUserDepartments, DEPARTMENT_INFO } from "@/lib/departments";
import { loadAdminDashboard } from "@/lib/dashboard";
import { loadRecruitingDashboard } from "@/lib/recruiting";
import { loadSalesDashboard } from "@/lib/salesDashboard";
import { getPendingOnboardingCount } from "@/lib/onboarding";
import { getLatestMonthlyFinancials, getTeamGoals, getChecklistTasksForRole, getOpenLoans } from "@/lib/financials";
import { reachedGrowthStages } from "@/lib/checklistDisplay";
import { estimateLoanPayoff } from "@/lib/loans";
import { getTodayCardData } from "@/lib/hrToday";
import { getAllAreaAccessForUser } from "@/lib/officeAssistant";
import ChecklistSidebar from "@/components/ChecklistSidebar";
import TodayCard from "./TodayCard";
import RookieJourneyHome from "./RookieJourneyHome";
import TraineeHome from "./TraineeHome";
import TrainerHome from "./TrainerHome";
import { getTrainingExperienceVersion } from "@/lib/rookieJourney";
import { DollarIcon, BriefcaseIcon, BuildingIcon, PeopleIcon, ShieldCheckIcon } from "@/components/icons";

function Stat({
  label,
  value,
  href,
  caption,
  prominent,
}: {
  label: string;
  value: number | string;
  href?: string;
  caption?: React.ReactNode;
  // A larger, higher-contrast tile for the 2-3 numbers that matter most on
  // a given card (e.g. Monthly Goal/Won/Left-to-go) — everything else stays
  // the smaller, denser secondary-stat style it always was.
  prominent?: boolean;
}) {
  const content = prominent ? (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
      {caption && <p className="mt-1 text-xs text-neutral-500">{caption}</p>}
    </>
  ) : (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-neutral-900">{value}</p>
      {caption && <p className="mt-0.5 text-xs text-neutral-500">{caption}</p>}
    </>
  );
  const boxClass = prominent
    ? "block rounded-xl border border-neutral-200 bg-white p-4"
    : "block rounded-md bg-neutral-50 p-3";
  if (href) {
    return (
      <Link href={href} className={`${boxClass} hover:border-brand-300 hover:bg-neutral-50`}>
        {content}
      </Link>
    );
  }
  return <div className={boxClass}>{content}</div>;
}

// A dark "highlight" tile for the single most important number on a stat
// row (e.g. "Left to reach goal", "Ending Bank Balance") — matches the
// navy-accent tile in the approved mockups.
function HighlightStat({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="rounded-xl bg-brand-600 p-4 text-white">
      <p className="text-xs font-medium uppercase tracking-wide text-gold-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {caption && <p className="mt-1 text-xs text-white/70">{caption}</p>}
    </div>
  );
}

function ShortcutCard({
  href,
  label,
  caption,
  icon,
}: {
  href: string;
  label: string;
  caption: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-gold-400"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-50 text-gold-600">
        {icon}
      </span>
      <p className="mt-3 text-sm font-semibold text-neutral-900" aria-hidden="true">{label}</p>
      <p className="mt-0.5 text-xs text-neutral-500" aria-hidden="true">{caption}</p>
    </Link>
  );
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
  // One query covers every area-access check below (HR Summary, Training,
  // Assigned Tasks, plus the shortcut-row grants further down) instead of
  // three separate ones — same values as before, fewer round trips. Only
  // ever populated for Office Assistant; every other role's booleans below
  // fall back to their original role-only logic, unchanged.
  const officeAssistantAreas = isOfficeAssistant ? (await getAllAreaAccessForUser(session.sub)).areas : undefined;
  // Home shows cross-department $ figures (Goals) and HR headline counts
  // (Training/Recruiting) that no other non-admin role sees today — gate
  // both behind this role's own HR_SUMMARY grant rather than leaving them
  // open the way they already are for SERVICE_MANAGER/ADMIN.
  const canViewHrSummary = isOfficeAssistant ? !!officeAssistantAreas?.HR_SUMMARY?.canView : !isSalesRep;
  // The Training card's own button is gated by the Training area grant
  // specifically, independent of HR_SUMMARY above — an Office Assistant can
  // have HR Summary access without Training access, or vice versa, and the
  // button here must only ever offer what that specific grant allows.
  const canViewTrainingModules = isOfficeAssistant ? !!officeAssistantAreas?.TRAINING?.canView : true;
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
    ? (officeAssistantAreas?.ASSIGNED_TASKS ?? { canView: false, canEdit: false })
    : { canView: true, canEdit: true };
  // Owner's four department shortcuts on Home — same departments/hrefs the
  // sidebar's own "departments" nav group already uses (resolveUserDepartments
  // + DEPARTMENT_INFO), not a new access decision.
  const ownerDepartments = isAdmin ? resolveUserDepartments(session.role, grants) : [];
  // Office Assistant's equivalent: only the work areas she's actually been
  // granted view access to. Same areas/hrefs/labels as navigation.ts's own
  // OFFICE_ASSISTANT_NAV_LINKS (the mockup's illustrative "Onboarding" /
  // "Interviews" tile names don't correspond to separate pages today — both
  // are part of the Recruiting pipeline itself, not their own area/grant —
  // so this uses the real, existing area names instead of inventing new
  // destinations) — "prominent only where existing grants allow," never a
  // new area.
  const officeAssistantShortcuts = isOfficeAssistant
    ? (
        [
          { area: "RECRUITING", href: "/recruiting", label: "Recruiting", caption: "Applicants & interviews" },
          { area: "HR_SUMMARY", href: "/hr", label: "HR Summary", caption: "Onboarding & headcount" },
          { area: "SALES_LEADS", href: "/sales/leads", label: "Leads", caption: "Leads & callbacks" },
          { area: "STAFF_DIRECTORY", href: "/staff", label: "Staff", caption: "Employee directory" },
          { area: "OPERATIONAL_STATUS", href: "/operations", label: "Operations", caption: "Operational status" },
        ] as const
      ).filter((link) => officeAssistantAreas?.[link.area]?.canView)
    : [];

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

  const firstName = session.name.split(" ")[0];
  const salesProgressPct = sales && sales.goal > 0 ? Math.min(100, (sales.revenueTowardGoal / sales.goal) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">
          {isAdmin ? `Your business at a glance, ${firstName}` : `Good day, ${firstName}`}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isAdmin ? "Your business overview and the work needing attention." : "Here's today at a glance."}
        </p>
      </div>

      {isAdmin && latestFinancials && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium text-neutral-900">Financial Overview</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-400">
                {latestFinancials.monthLabel} {latestFinancials.month.slice(0, 4)} reporting period
              </span>
              <Link href="/financials" className="text-sm font-medium text-brand-700 hover:underline">
                View full Financials →
              </Link>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat label="Revenue" value={money(latestFinancials.revenueTotal)} prominent />
            <Stat label="Net Profit" value={money(latestFinancials.netProfit)} prominent />
            <HighlightStat label="Ending Bank Balance" value={money(latestFinancials.endingBankBalance)} caption="Period-end, not a live bank feed" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="Net Margin" value={`${(latestFinancials.netMarginPct * 100).toFixed(1)}%`} />
            <Stat label="Variance to Target" value={money(latestFinancials.varianceToTarget)} />
            <Stat label="Owner Draw" value={money(latestFinancials.ownerDraw)} />
          </div>
        </section>
      )}

      {isAdmin && openLoans.length > 0 && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-neutral-900">Loans</h2>
            <Link href="/financials" className="text-sm font-medium text-brand-700 hover:underline">
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
                <div key={loan.id} className="rounded-xl bg-neutral-50 p-3">
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
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
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
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
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
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Monthly Goal"
              value={sales.goal > 0 ? money(sales.goal) : "Not set"}
              caption={sales.goal > 0 ? salesGoalProgressText : undefined}
              prominent
            />
            <Stat
              label={sales.actuals.entered ? "Actual Revenue" : "Won This Month (from quotes)"}
              value={money(sales.revenueTowardGoal)}
              href="/sales/quotes?status=won"
              prominent
            />
            <HighlightStat
              label="Left to Reach Goal"
              value={sales.goal > 0 ? money(Math.max(0, sales.revenueRemaining)) : "—"}
              caption={sales.goal > 0 ? `${Math.round(salesProgressPct)}% of the way there` : undefined}
            />
          </div>
          {sales.goal > 0 && (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-gold-500" style={{ width: `${salesProgressPct}%` }} />
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Cleanings Needed"
              value={sales.cleaningsNeeded === null ? "Not enough data" : String(sales.cleaningsNeeded)}
              caption="Estimate, not available schedule capacity"
            />
            {isAdmin && (
              <Stat
                label="Revenue less entered labor"
                value={sales.actuals.entered && sales.actuals.profit !== null ? money(sales.actuals.profit) : "—"}
                caption={sales.actuals.profit !== null ? "Excludes other expenses — not net profit" : undefined}
              />
            )}
            <Stat label="Pending Quotes" value={sales.pendingCount} href="/sales/quotes?status=pending" />
            <Stat label="Win Rate" value={sales.winRate === null ? "—" : `${Math.round(sales.winRate * 100)}%`} />
          </div>
          <Link href="/sales" className="mt-5 inline-block text-sm font-medium text-brand-700 hover:underline">
            View full Sales dashboard →
          </Link>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0">
          <TodayCard
            data={todayCard}
            isAdmin={isAdmin}
            hasSalesAccess={hasSalesAccess}
            canViewPayroll={canViewPayroll}
            isSalesRep={isSalesRep}
          />
        </div>
        <div className="min-w-0">
          <ChecklistSidebar items={checklistItems} isAdmin={isAdmin} canEditTasks={assignedTasksAccess.canEdit} />
        </div>
      </div>

      {canViewHrSummary && training && recruiting && (
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
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

          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
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

      {isAdmin && ownerDepartments.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {ownerDepartments.map((d) => {
            const info = DEPARTMENT_INFO[d.department];
            const Icon =
              d.department === "HR"
                ? PeopleIcon
                : d.department === "SALES"
                  ? DollarIcon
                  : d.department === "OPERATIONS"
                    ? BriefcaseIcon
                    : ShieldCheckIcon;
            return (
              <ShortcutCard
                key={d.department}
                href={info.href}
                label={info.labelEn}
                caption={`${info.labelEn} tools`}
                icon={<Icon className="h-4 w-4" />}
              />
            );
          })}
        </div>
      )}

      {isOfficeAssistant && officeAssistantShortcuts.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {officeAssistantShortcuts.map((s) => (
            <ShortcutCard
              key={s.area}
              href={s.href}
              label={s.label}
              caption={s.caption}
              icon={<BuildingIcon className="h-4 w-4" />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
