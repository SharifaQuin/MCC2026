import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { loadSalesDashboard, getSalesActuals } from "@/lib/salesDashboard";
import { loadLeadKpis, getMonthlyLeadOutcomeCounts } from "@/lib/leads";
import { resolveActiveSlotMonth, getNextOpenSlots } from "@/lib/slotCapacitySummary";
import { setSalesGoalAction } from "@/app/(portal)/sales/actions";
import { getOverdueSalesChecklistTasks } from "@/lib/hrToday";
import { getChecklistTasksForRole } from "@/lib/financials";
import AssignedChecklist from "@/components/AssignedChecklist";
import AdSpendForm from "./AdSpendForm";
import NextOpenSlotsCard from "./NextOpenSlotsCard";
import RevenueEntryForm from "./RevenueEntryForm";
import LaborEntryForm from "./LaborEntryForm";
import { PeopleIcon, DollarIcon, ClipboardListIcon, CalendarIcon } from "@/components/icons";
import { businessMonthKey, businessDateTimeInputValue } from "@/lib/timezone";
import { isValidMonthKey, monthBoundsUtc, getRevenueEntryForMonth } from "@/lib/salesRevenueSnapshot";

function Stat({
  label,
  value,
  accent,
  caption,
  prominent,
}: {
  label: string;
  value: string;
  accent?: boolean;
  caption?: React.ReactNode;
  prominent?: boolean;
}) {
  if (prominent) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
        {caption && <p className="mt-1 text-xs text-neutral-500">{caption}</p>}
      </div>
    );
  }
  return (
    <div className="rounded-md bg-neutral-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold ${accent ? "text-brand-700" : "text-neutral-900"}`}>{value}</p>
      {caption && <p className="mt-0.5 text-xs text-neutral-500">{caption}</p>}
    </div>
  );
}

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
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-50 text-gold-600">{icon}</span>
      <p className="mt-3 text-sm font-semibold text-neutral-900" aria-hidden="true">{label}</p>
      <p className="mt-0.5 text-xs text-neutral-500" aria-hidden="true">{caption}</p>
    </Link>
  );
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function SalesPage({
  searchParams,
}: {
  searchParams?: { month?: string };
}) {
  const { session } = await requireDepartmentAccess("SALES");
  // Goals, actuals, and ad spend are owner-only to set — see
  // src/app/(portal)/sales/actions.ts. A Sales canEdit grant still governs
  // every other edit control on this page (assigning leads, etc.), just
  // not these three financial inputs.
  const isAdmin = session.role === "ADMIN";
  const isSalesRep = session.role === "SALES_REP";

  // The revenue/labor entry section below is independent of `dash` and of
  // the goal tracker: `loadSalesDashboard` always reads the CURRENT month
  // (it's never passed a monthKey), so viewing or saving a past reporting
  // month here can never change what Home or the goal tracker show. Only
  // ever computed for an admin — a non-admin render never even queries
  // this data, not just hides it client-side.
  const requestedMonth = searchParams?.month ?? "";
  const selectedMonth = isValidMonthKey(requestedMonth) ? requestedMonth : businessMonthKey();

  const [dash, leadKpis, monthlyLeadOutcomes, overdueSalesTasks, assignedTasks, selectedMonthActuals, revenueEntry] =
    await Promise.all([
      loadSalesDashboard(isAdmin),
      loadLeadKpis(),
      getMonthlyLeadOutcomeCounts(),
      // Her sales-only equivalent of the general Today card — see
      // getOverdueSalesChecklistTasks' own comment for why she doesn't see
      // the general one at all (it's HR/recruiting/staffing content).
      isSalesRep ? getOverdueSalesChecklistTasks() : Promise.resolve([]),
      // Her general assigned/shared checklist — the same query /todo's
      // non-admin branch already runs. She lands here, not on Home (see
      // src/app/(portal)/page.tsx's SALES_REP redirect), so this is the only
      // place she'd otherwise ever see these.
      isSalesRep ? getChecklistTasksForRole(session.role, session.sub) : Promise.resolve([]),
      isAdmin ? getSalesActuals(selectedMonth) : Promise.resolve(null),
      isAdmin ? getRevenueEntryForMonth(selectedMonth) : Promise.resolve(null),
    ]);

  const assignedTaskRows = assignedTasks.map((t) => ({
    id: t.id,
    task: t.task,
    effectiveStatus: t.effectiveStatus,
    notes: t.notes,
    targetDate: t.targetDate ? t.targetDate.toISOString() : null,
    dueFridayOfWeek: t.dueFridayOfWeek,
    frequency: t.frequency,
  }));

  const activeSlotMonth = await resolveActiveSlotMonth();
  const nextOpenSlots = activeSlotMonth ? await getNextOpenSlots(activeSlotMonth, 5, undefined, isAdmin) : [];

  const goalHit = dash.goal > 0 && dash.revenueTowardGoal >= dash.goal;
  // Shared between the header badge (unchanged, already existed) and the
  // Monthly Goal Stat tile's new caption below — same text, two places.
  const goalProgressText = goalHit ? "Goal hit! 🎉" : `${money(dash.revenueRemaining)} to go`;

  const salesProgressPct = dash.goal > 0 ? Math.min(100, (dash.revenueTowardGoal / dash.goal) * 100) : 0;

  const toDateInputValue = (d: Date) => d.toISOString().slice(0, 10);
  const { last: selectedMonthLastDay } = monthBoundsUtc(selectedMonth);

  const revenueDefaults =
    revenueEntry?.kind === "snapshot"
      ? {
          revenue: String(revenueEntry.revenue),
          source: revenueEntry.source,
          coverage: revenueEntry.coverage,
          coverageThrough: toDateInputValue(revenueEntry.coverageThrough),
          sourceAsOf: businessDateTimeInputValue(revenueEntry.sourceAsOf),
          status: revenueEntry.status,
        }
      : {
          revenue: revenueEntry?.kind === "legacy" ? String(revenueEntry.revenue) : "",
          source: "",
          coverage: "FULL_MONTH",
          coverageThrough: toDateInputValue(selectedMonthLastDay),
          sourceAsOf: businessDateTimeInputValue(new Date()),
          status: "PROVISIONAL",
        };

  const laborDefaultValue =
    selectedMonthActuals && selectedMonthActuals.labor !== null ? String(selectedMonthActuals.labor) : "";

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">
        {isSalesRep ? "Good day — here's where things stand" : "Sales"}
      </h1>

      {isSalesRep && overdueSalesTasks.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="mb-2 font-medium text-amber-900">Overdue Sales Tasks</p>
          <div className="flex flex-wrap gap-2">
            {overdueSalesTasks.map((t) => (
              <span key={t.id} className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800">
                {t.task}
              </span>
            ))}
          </div>
        </div>
      )}

      {isSalesRep && (
        <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-neutral-900">Goal Progress</h2>
            {dash.goal > 0 && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  goalHit ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {goalProgressText}
              </span>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Monthly Goal"
              value={dash.goal > 0 ? money(dash.goal) : "Not set"}
              caption={dash.goal > 0 ? goalProgressText : undefined}
              prominent
            />
            <Stat
              label={dash.actuals.entered ? "Actual Revenue" : "Won This Month (from quotes)"}
              value={money(dash.revenueTowardGoal)}
              prominent
            />
            <HighlightStat
              label="Left to Reach Goal"
              value={dash.goal > 0 ? money(Math.max(0, dash.revenueRemaining)) : "—"}
              caption={dash.goal > 0 ? `${Math.round(salesProgressPct)}% of the way there` : undefined}
            />
          </div>
          {dash.goal > 0 && (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-gold-500" style={{ width: `${salesProgressPct}%` }} />
            </div>
          )}

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div data-testid="sales-rep-my-tasks">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-900">My Tasks</h3>
                <Link href="/todo" className="text-xs font-medium text-brand-700 hover:underline">
                  View all tasks →
                </Link>
              </div>
              <div className="mt-3">
                <AssignedChecklist tasks={assignedTaskRows} canEdit={true} />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Pending Opportunities</h3>
              {dash.topOpportunities.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-400">No pending opportunities right now.</p>
              ) : (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {dash.topOpportunities.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-100 px-3 py-2">
                      <Link
                        href={`/sales/pricing-tool?quote=${encodeURIComponent(o.id)}`}
                        className="min-w-0 truncate font-medium text-brand-700 hover:underline"
                      >
                        {o.clientName}, {o.city}
                      </Link>
                      <span className="shrink-0 text-neutral-600">{money(o.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {isSalesRep && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <ShortcutCard
            href="/sales/leads"
            label="Leads & Callbacks"
            caption="Lead follow-ups"
            icon={<PeopleIcon className="h-4 w-4" />}
          />
          <ShortcutCard
            href="/sales/pricing-tool"
            label="Pricing Calculator"
            caption="Build a quote"
            icon={<DollarIcon className="h-4 w-4" />}
          />
          <ShortcutCard
            href="/sales/quotes"
            label="Quotes"
            caption="Pending & won"
            icon={<ClipboardListIcon className="h-4 w-4" />}
          />
          <ShortcutCard
            href="/sales/open-slots"
            label="Open Slots"
            caption="Book from a lead"
            icon={<CalendarIcon className="h-4 w-4" />}
          />
        </div>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-neutral-900">This Month</h2>
          {!isSalesRep && dash.goal > 0 && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                goalHit ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {goalProgressText}
            </span>
          )}
        </div>

        {isSalesRep ? (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Leads Won This Month" value={String(monthlyLeadOutcomes.wonThisMonth)} />
            <Stat label="Leads Lost This Month" value={String(monthlyLeadOutcomes.lostThisMonth)} />
            <Stat
              label="Cleanings Needed"
              value={goalHit ? "0" : dash.goal > 0 ? String(dash.cleaningsNeeded) : "—"}
            />
            <Stat label="Pending Quotes" value={String(dash.pendingCount)} />
            <Stat
              label="Win Rate"
              value={dash.winRate === null ? "—" : `${Math.round(dash.winRate * 100)}%`}
            />
            <Stat label="Avg. Job Value" value={dash.averageJobValue ? money(dash.averageJobValue) : "—"} />
            <Stat label="Won (all-time)" value={String(dash.wonCount)} />
            <Stat label="Lost (all-time)" value={String(dash.lostCount)} />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label={dash.actuals.entered ? "Actual Revenue" : "Won This Month (from quotes)"}
              value={money(dash.revenueTowardGoal)}
              accent
            />
            {/* Lead-level (not quote-level) outcome counts, up top and
                prominent — distinct from the dollar figure above, which is
                from quotes. All-time Won/Lost counts stay fully visible, just
                moved to the end of this grid so the month reads first. */}
            <Stat label="Leads Won This Month" value={String(monthlyLeadOutcomes.wonThisMonth)} />
            <Stat label="Leads Lost This Month" value={String(monthlyLeadOutcomes.lostThisMonth)} />
            <Stat
              label="Monthly Goal"
              value={dash.goal > 0 ? money(dash.goal) : "Not set"}
              caption={dash.goal > 0 ? goalProgressText : undefined}
            />
            <Stat
              label="Cleanings Needed"
              value={goalHit ? "0" : dash.goal > 0 ? String(dash.cleaningsNeeded) : "—"}
            />
            <Stat label="Pending Quotes" value={String(dash.pendingCount)} />
            <Stat
              label="Win Rate"
              value={dash.winRate === null ? "—" : `${Math.round(dash.winRate * 100)}%`}
            />
            <Stat
              label="Avg. Job Value"
              value={dash.averageJobValue ? money(dash.averageJobValue) : "—"}
            />
            <Stat label="Won (all-time)" value={String(dash.wonCount)} />
            <Stat label="Lost (all-time)" value={String(dash.lostCount)} />
          </div>
        )}

        {isAdmin && (
          <form action={setSalesGoalAction} className="mt-5 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="revenueGoal" className="block text-xs font-medium text-neutral-500">
                Set this month&rsquo;s revenue goal
              </label>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-neutral-500">$</span>
                <input
                  type="number"
                  id="revenueGoal"
                  name="revenueGoal"
                  min={0}
                  step="0.01"
                  defaultValue={dash.goal || ""}
                  placeholder="e.g. 5000"
                  className="w-32 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Save Goal
            </button>
          </form>
        )}

        {isAdmin && selectedMonthActuals && (
          <div data-testid="completed-cleaning-revenue-card" className="mt-6 rounded-md border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">Completed Cleaning Revenue</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Completed cleaning charges for a reporting month — not cash collected. Once
                  entered for the current month, this replaces the quote-based estimate above for
                  goal tracking; a past month here never changes what Home or this month&rsquo;s
                  goal tracker show.
                </p>
              </div>
              <form method="GET" className="flex items-end gap-2">
                <div>
                  <label htmlFor="month" className="block text-xs font-medium text-neutral-500">
                    Reporting month
                  </label>
                  <input
                    type="month"
                    id="month"
                    name="month"
                    defaultValue={selectedMonth}
                    className="mt-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  View month
                </button>
              </form>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat
                label="Completed Cleaning Charges"
                value={selectedMonthActuals.entered ? money(selectedMonthActuals.revenue) : "Not yet entered"}
              />
              {selectedMonthActuals.labor !== null && (
                <Stat label="Labor" value={money(selectedMonthActuals.labor)} />
              )}
              {selectedMonthActuals.profit !== null && (
                <Stat label="Revenue less entered labor" value={money(selectedMonthActuals.profit)} accent />
              )}
            </div>
            {selectedMonthActuals.profit === null && selectedMonthActuals.entered && (
              <p className="mt-1 text-xs text-neutral-400">
                Labor hasn&rsquo;t been entered for this month yet, so a revenue-less-labor figure
                isn&rsquo;t shown. This never includes other expenses.
              </p>
            )}

            {revenueEntry?.kind === "snapshot" && (
              <p className="mt-3 text-xs text-neutral-500">
                {revenueEntry.coverage === "FULL_MONTH" ? "Full month" : "Month to date"}, as of{" "}
                {revenueEntry.sourceAsOf.toLocaleString()}, from {revenueEntry.source} —{" "}
                {revenueEntry.status === "RECONCILED" ? "Reconciled" : "Provisional"}. Entered by{" "}
                {revenueEntry.enteredByName}.
              </p>
            )}
            {revenueEntry?.kind === "legacy" && (
              <p className="mt-3 text-xs text-neutral-500">
                Entered before source/coverage tracking existed — no metadata available for this
                month. Saving below starts a new, fully-tracked entry without altering this history.
              </p>
            )}

            <div className="mt-4 border-t border-neutral-200 pt-4">
              <p className="text-xs font-medium text-neutral-500">Enter completed cleaning charges</p>
              <RevenueEntryForm monthKey={selectedMonth} defaults={revenueDefaults} />
            </div>

            <div className="mt-4 border-t border-neutral-200 pt-4">
              <p className="text-xs font-medium text-neutral-500">Enter labor</p>
              <LaborEntryForm monthKey={selectedMonth} defaultValue={laborDefaultValue} />
            </div>
          </div>
        )}

        {!isSalesRep && dash.goal > 0 && !goalHit && dash.topOpportunities.length > 0 && (
          <div className="mt-6 rounded-md border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-sm font-medium text-neutral-900">
              Closest pending opportunities toward the goal
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Based on your saved quotes only — we don&rsquo;t yet pull real scheduled-job dates
              from TCS, so this can&rsquo;t point to a specific day/location the way a full
              scheduling view could.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {dash.topOpportunities.map((o) => (
                <li key={o.id} className="flex items-center justify-between">
                  <Link
                    href={`/sales/pricing-tool?quote=${encodeURIComponent(o.id)}`}
                    className="text-brand-700 hover:underline"
                  >
                    {o.clientName} &mdash; {o.city}
                  </Link>
                  <span className="text-neutral-600">
                    {o.service} · {money(o.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {activeSlotMonth && (
        <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-neutral-900">Next Open Slots to Fill</h2>
            <div className="flex items-center gap-3">
              <Link href="/sales/open-slots" className="text-xs font-medium text-brand-700 hover:underline">
                View all open slots →
              </Link>
              <Link href="/sales/bookings" className="text-xs font-medium text-brand-700 hover:underline">
                View booked slots →
              </Link>
              <Link href="/management/slot-capacity" className="text-xs font-medium text-brand-700 hover:underline">
                Full capacity view →
              </Link>
            </div>
          </div>
          <NextOpenSlotsCard slots={nextOpenSlots} month={activeSlotMonth} />
          <p className="mt-3 text-xs text-neutral-400">
            An old client calling in? Use &ldquo;Book for a call-in client&rdquo; on any slot below —
            no quote needed.
          </p>
          <Link
            href="/sales/pricing-tool"
            className="mt-4 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Open Pricing Tool to Book
          </Link>
        </section>
      )}

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-neutral-900">Lead Pipeline</h2>
          <Link
            href="/sales/leads"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Open Lead Pipeline
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Open Leads" value={String(leadKpis.openLeadCount)} />
          <Stat label="Pipeline Value" value={money(leadKpis.pipelineValue)} accent />
          <Stat
            label="Avg. Response Time"
            value={
              leadKpis.avgResponseHours === null
                ? "—"
                : leadKpis.avgResponseHours < 1
                  ? `${Math.round(leadKpis.avgResponseHours * 60)} min`
                  : `${leadKpis.avgResponseHours.toFixed(1)} hrs`
            }
          />
          <Stat label="Needs Attention" value={String(leadKpis.needsAttention.length)} />
        </div>

        {leadKpis.needsAttention.length > 0 && (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="mb-2 font-medium text-amber-800">Needs attention</p>
            <div className="flex flex-wrap gap-2 text-sm">
              {leadKpis.needsAttention.map((l) => (
                <Link
                  key={l.id}
                  href={`/sales/leads/${l.id}`}
                  className="rounded-full bg-white px-3 py-1 font-medium text-amber-800 hover:underline"
                >
                  {l.firstName} {l.lastName}{" "}
                  {l.reason === "new"
                    ? `— not yet contacted (${new Date(l.since).toLocaleDateString()})`
                    : `— follow-up overdue (${new Date(l.since).toLocaleDateString()})`}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <p className="mb-3 text-sm font-medium text-neutral-900">Source ROI (this month)</p>
          {leadKpis.bySource.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="py-2 pr-4">Source</th>
                    <th className="py-2 pr-4" title="Every lead received this month from this source, including any scam-classified ones">
                      Leads (All-Received)
                    </th>
                    <th className="py-2 pr-4">Won</th>
                    <th className="py-2 pr-4">Spend</th>
                    <th className="py-2 pr-4">Cost / Lead</th>
                    <th className="py-2 pr-4">Cost / Won</th>
                  </tr>
                </thead>
                <tbody>
                  {leadKpis.bySource.map((s) => (
                    <tr key={s.source} className="border-b border-neutral-100 last:border-0">
                      <td className="py-2 pr-4 font-medium text-neutral-900">{s.label}</td>
                      <td className="py-2 pr-4 text-neutral-600">{s.leadCount}</td>
                      <td className="py-2 pr-4 text-neutral-600">{s.wonCount}</td>
                      <td className="py-2 pr-4 text-neutral-600">{money(s.amountSpent)}</td>
                      <td className="py-2 pr-4 text-neutral-600">
                        {s.costPerLead === null ? "—" : money(s.costPerLead)}
                      </td>
                      <td className="py-2 pr-4 text-neutral-600">
                        {s.costPerWon === null ? "—" : money(s.costPerWon)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">
              No leads or ad spend logged yet this month.
            </p>
          )}
          {isAdmin && (
            <div className="mt-4">
              <AdSpendForm
                currentSpend={Object.fromEntries(leadKpis.bySource.map((s) => [s.source, s.amountSpent]))}
                monthLabel={new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              />
            </div>
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">Pricing &amp; Client Quotes</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Calculate job pricing, build client-facing quotes, and track profitability.
          </p>
          <Link
            href="/sales/pricing-tool"
            className="mt-5 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Open Pricing &amp; Quotes Tool
          </Link>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">Quotes</h2>
          <p className="mt-1 text-sm text-neutral-500">
            See every saved quote in one place and track pending, won, and lost deals.
          </p>
          <Link
            href="/sales/quotes"
            className="mt-5 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            View Quotes
          </Link>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">Message Templates</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Canned emails/texts your team can pick from when reaching out to a lead.
          </p>
          <Link
            href="/sales/message-templates"
            className="mt-5 inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Manage Templates
          </Link>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">Scheduled Sends</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Emails and texts queued to go out later — edit, reschedule, or cancel before they send.
          </p>
          <Link
            href="/scheduled"
            className="mt-5 inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            View Scheduled Sends
          </Link>
        </section>
      </div>
    </div>
  );
}
