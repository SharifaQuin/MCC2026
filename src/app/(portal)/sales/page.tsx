import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { loadSalesDashboard } from "@/lib/salesDashboard";
import { setSalesGoalAction } from "@/app/(portal)/sales/actions";

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md bg-neutral-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold ${accent ? "text-brand-700" : "text-neutral-900"}`}>{value}</p>
    </div>
  );
}

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default async function SalesPage() {
  const { canEdit } = await requireDepartmentAccess("SALES");
  const dash = await loadSalesDashboard();

  const goalHit = dash.goal > 0 && dash.wonRevenueThisMonth >= dash.goal;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Sales</h1>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-neutral-900">This Month</h2>
          {dash.goal > 0 && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                goalHit ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {goalHit ? "Goal hit! 🎉" : `${money(dash.revenueRemaining)} to go`}
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Won This Month" value={money(dash.wonRevenueThisMonth)} accent />
          <Stat label="Monthly Goal" value={dash.goal > 0 ? money(dash.goal) : "Not set"} />
          <Stat
            label="Cleanings Needed"
            value={goalHit ? "0" : dash.goal > 0 ? String(dash.cleaningsNeeded) : "—"}
          />
          <Stat label="Pending Quotes" value={String(dash.pendingCount)} />
          <Stat label="Won (all-time)" value={String(dash.wonCount)} />
          <Stat label="Lost (all-time)" value={String(dash.lostCount)} />
          <Stat
            label="Win Rate"
            value={dash.winRate === null ? "—" : `${Math.round(dash.winRate * 100)}%`}
          />
          <Stat
            label="Avg. Job Value"
            value={dash.averageJobValue ? money(dash.averageJobValue) : "—"}
          />
        </div>

        {canEdit && (
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
                  step={50}
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

        {dash.goal > 0 && !goalHit && dash.topOpportunities.length > 0 && (
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
      </div>
    </div>
  );
}
