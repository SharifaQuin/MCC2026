import Link from "next/link";
import { getMonthlyFinancials, getOwnerSettings, getLoans } from "@/lib/financials";
import {
  upsertMonthlyFinancialsAction,
  updateDrawPolicyAction,
  updateProfitabilityTargetAction,
  disconnectQuickBooksAction,
} from "@/app/actions/financials";
import { getQuickBooksConnection, isQuickBooksConfigured } from "@/lib/quickbooks";
import LoansManager from "./LoansManager";
import PullFromQuickBooksButton from "./PullFromQuickBooksButton";

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function Field({
  label,
  name,
  defaultValue,
  step = "0.01",
  optional = false,
  readOnly = false,
  type,
}: {
  label: string;
  name: string;
  defaultValue?: number | string | null;
  step?: string;
  optional?: boolean;
  readOnly?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-600">
        {label}
        {optional ? " (optional)" : ""}
      </label>
      <input
        type={type ?? (typeof defaultValue === "string" ? "text" : "number")}
        step={step}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={!optional}
        readOnly={readOnly}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm read-only:bg-neutral-50 read-only:text-neutral-500"
      />
    </div>
  );
}

interface DrawPolicy {
  fixed_monthly_amount?: number;
  cash_floor_minimum?: number;
  note?: string;
}
interface ProfitabilityTarget {
  target_net_margin_pct?: number;
  estimated_revenue_needed_monthly?: number;
  note?: string;
}

export default async function FinancialsPage({
  searchParams,
}: {
  searchParams: { month?: string; quickbooks?: string };
}) {
  const [months, ownerSettings, loans, quickBooksConnection] = await Promise.all([
    getMonthlyFinancials(),
    getOwnerSettings(),
    getLoans(),
    getQuickBooksConnection(),
  ]);

  const selectedMonth = searchParams.month ?? "";
  const isNew = selectedMonth === "new";
  const editing = !isNew && selectedMonth ? months.find((m) => m.month === selectedMonth) ?? null : null;

  const drawPolicy = ownerSettings.owner_draw_policy as DrawPolicy | undefined;
  const profitabilityTarget = ownerSettings.profitability_target as ProfitabilityTarget | undefined;

  const loanRows = loans.map((l) => ({
    id: l.id,
    lender: l.lender,
    loanType: l.loanType,
    status: l.status,
    originationDate: l.originationDate ? l.originationDate.toISOString() : null,
    closedDate: l.closedDate ? l.closedDate.toISOString() : null,
    loanAmount: l.loanAmount,
    feeAmount: l.feeAmount,
    totalToRepay: l.totalToRepay,
    repaymentRatePct: l.repaymentRatePct,
    minimumPayment: l.minimumPayment,
    minimumPaymentFrequency: l.minimumPaymentFrequency,
    maturityDate: l.maturityDate ? l.maturityDate.toISOString() : null,
    currentBalance: l.currentBalance,
    currentBalanceAsOf: l.currentBalanceAsOf ? l.currentBalanceAsOf.toISOString() : null,
    notes: l.notes,
  }));

  const latest = months[0] ?? null;
  const cashFloor = drawPolicy?.cash_floor_minimum;
  const drawAmount = drawPolicy?.fixed_monthly_amount;
  const cashAboveFloor = latest && cashFloor !== undefined ? latest.endingBankBalance - cashFloor : null;

  let drawStatus: { label: string; tone: "green" | "amber" | "red" } | null = null;
  if (cashAboveFloor !== null) {
    if (drawAmount !== undefined && cashAboveFloor >= drawAmount) {
      drawStatus = { label: `Full draw available (${money(drawAmount)})`, tone: "green" };
    } else if (cashAboveFloor > 0) {
      drawStatus = { label: "Only a partial draw available", tone: "amber" };
    } else {
      drawStatus = { label: "Hold the draft — below cash floor", tone: "red" };
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Financials</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Owner-only — full monthly P&amp;L history, targets, and settings.
      </p>

      {searchParams.quickbooks === "connected" && (
        <div className="mb-6 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          QuickBooks connected. Open a month below and use "Pull from QuickBooks" to bring in its numbers.
        </div>
      )}
      {searchParams.quickbooks === "error" && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Couldn't connect to QuickBooks — please try again.
        </div>
      )}

      <section className="mb-8 flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
        {quickBooksConnection ? (
          <>
            <p className="text-sm text-neutral-700">
              <span className="font-medium text-green-700">✓ QuickBooks connected</span> — by{" "}
              {quickBooksConnection.connectedBy.name}
            </p>
            <form action={disconnectQuickBooksAction}>
              <button type="submit" className="text-sm font-medium text-red-600 hover:underline">
                Disconnect
              </button>
            </form>
          </>
        ) : isQuickBooksConfigured() ? (
          <>
            <p className="text-sm text-neutral-500">Not connected to QuickBooks yet.</p>
            <a
              href="/api/quickbooks/connect"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Connect QuickBooks
            </a>
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            QuickBooks isn't set up yet — add QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET to enable it.
          </p>
        )}
      </section>

      {latest && (
        <section className="mb-8 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="mb-1 text-lg font-medium text-neutral-900">
            Cheat Sheet — {latest.monthLabel} {latest.month.slice(0, 4)}
          </h2>
          <p className="mb-4 text-xs text-neutral-500">The at-a-glance numbers, same idea as your old spreadsheet tab.</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-md bg-neutral-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Net Profit vs Target</p>
              <p className="mt-0.5 text-lg font-semibold text-neutral-900">
                {money(latest.netProfit)} <span className="text-sm font-normal text-neutral-400">/ {money(latest.target21pct)}</span>
              </p>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  latest.netProfit >= latest.target21pct ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {latest.netProfit >= latest.target21pct ? "On track" : "Below target"}
              </span>
            </div>
            <div className="rounded-md bg-neutral-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Variance to Target</p>
              <p
                className={`mt-0.5 text-lg font-semibold ${
                  latest.varianceToTarget < 0 ? "text-red-600" : "text-green-700"
                }`}
              >
                {money(latest.varianceToTarget)}
              </p>
            </div>
            <div className="rounded-md bg-neutral-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Ending Bank Balance</p>
              <p className="mt-0.5 text-lg font-semibold text-neutral-900">{money(latest.endingBankBalance)}</p>
              {cashFloor !== undefined && (
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    latest.endingBankBalance >= cashFloor ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
                  }`}
                >
                  {latest.endingBankBalance >= cashFloor ? `Above ${money(cashFloor)} floor` : `Below ${money(cashFloor)} floor`}
                </span>
              )}
            </div>
            <div className="rounded-md bg-neutral-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Owner Draw</p>
              {drawStatus ? (
                <span
                  className={`mt-1.5 inline-block rounded-full px-2 py-1 text-xs font-medium ${
                    drawStatus.tone === "green"
                      ? "bg-green-100 text-green-800"
                      : drawStatus.tone === "amber"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  {drawStatus.label}
                </span>
              ) : (
                <p className="mt-0.5 text-sm text-neutral-400">Set a draw policy to see this</p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="mb-8 rounded-lg border border-neutral-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-neutral-900">Monthly P&amp;L</h2>
          <Link
            href="/financials?month=new"
            className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            + Add a month
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-3">Month</th>
                <th className="py-2 pr-3">Revenue</th>
                <th className="py-2 pr-3">Gross Profit</th>
                <th className="py-2 pr-3">OpEx</th>
                <th className="py-2 pr-3">Net Profit</th>
                <th className="py-2 pr-3">Net Margin</th>
                <th className="py-2 pr-3">Owner Draw</th>
                <th className="py-2 pr-3">Ending Bank</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {months.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-4 text-center text-neutral-400">
                    No months entered yet.
                  </td>
                </tr>
              )}
              {months.map((m) => (
                <tr key={m.month} className="border-b border-neutral-100">
                  <td className="py-2 pr-3 font-medium">
                    {m.monthLabel} {m.month.slice(0, 4)}
                  </td>
                  <td className="py-2 pr-3">{money(m.revenueTotal)}</td>
                  <td className="py-2 pr-3">{money(m.grossProfit)}</td>
                  <td className="py-2 pr-3">{money(m.opexTotal)}</td>
                  <td className={`py-2 pr-3 ${m.netProfit < 0 ? "text-red-600" : "text-green-700"}`}>
                    {money(m.netProfit)}
                  </td>
                  <td className="py-2 pr-3">{pct(m.netMarginPct)}</td>
                  <td className="py-2 pr-3">{money(m.ownerDraw)}</td>
                  <td className="py-2 pr-3">{money(m.endingBankBalance)}</td>
                  <td className="py-2">
                    <Link href={`/financials?month=${m.month}`} className="text-xs text-brand-700 hover:underline">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(editing || isNew) && (
        <section className="mb-8 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-medium text-neutral-900">
            {isNew ? "Add a month" : `Edit ${editing!.monthLabel} ${editing!.month.slice(0, 4)}`}
          </h2>
          <form action={upsertMonthlyFinancialsAction} className="space-y-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Field label="Month" name="month" type="month" defaultValue={editing?.month ?? ""} readOnly={!isNew} />
              <Field label="Month label (e.g. Jan)" name="monthLabel" defaultValue={editing?.monthLabel ?? ""} />
            </div>

            {quickBooksConnection && <PullFromQuickBooksButton />}

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-neutral-800">Revenue</legend>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Field label="Total revenue" name="revenueTotal" defaultValue={editing?.revenueTotal} />
                <Field label="Commercial revenue" name="revenueCommercial" defaultValue={editing?.revenueCommercial} />
                <Field label="Residential revenue" name="revenueResidential" defaultValue={editing?.revenueResidential} />
                <Field label="Cleaner tips (memo only)" name="cleanerTipsMemo" defaultValue={editing?.cleanerTipsMemo} optional />
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-neutral-800">Cost of Goods Sold</legend>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Field label="Technician payroll" name="technicianPayroll" defaultValue={editing?.technicianPayroll} />
                <Field label="Mileage reimbursements" name="mileageReimbursements" defaultValue={editing?.mileageReimbursements} />
                <Field label="Supplies" name="supplies" defaultValue={editing?.supplies} />
                <Field label="Total COGS" name="cogsTotal" defaultValue={editing?.cogsTotal} />
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-neutral-800">Gross Profit</legend>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Field label="Gross profit" name="grossProfit" defaultValue={editing?.grossProfit} />
                <Field
                  label="Gross margin (decimal, e.g. 0.52)"
                  name="grossMarginPct"
                  step="0.0001"
                  defaultValue={editing?.grossMarginPct}
                />
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-neutral-800">Operating Expenses</legend>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Field label="Admin payroll" name="adminPayroll" defaultValue={editing?.adminPayroll} />
                <Field label="Rent" name="rent" defaultValue={editing?.rent} />
                <Field label="Hiring & recruiting" name="hiringRecruiting" defaultValue={editing?.hiringRecruiting} />
                <Field label="Fuel" name="fuel" defaultValue={editing?.fuel} />
                <Field label="Insurance" name="insurance" defaultValue={editing?.insurance} />
                <Field label="Vehicle" name="vehicle" defaultValue={editing?.vehicle} />
                <Field label="Marketing" name="marketing" defaultValue={editing?.marketing} />
                <Field label="Fees" name="fees" defaultValue={editing?.fees} />
                <Field label="Misc" name="misc" defaultValue={editing?.misc} optional />
                <Field label="Credit card" name="creditCard" defaultValue={editing?.creditCard} />
                <Field label="Loan payoff" name="loanPayoff" defaultValue={editing?.loanPayoff} />
                <Field label="Stripe Capital interest" name="stripeCapitalInterest" defaultValue={editing?.stripeCapitalInterest} />
                <Field label="Equipment financing" name="equipmentFinancing" defaultValue={editing?.equipmentFinancing} />
                <Field label="Total OpEx" name="opexTotal" defaultValue={editing?.opexTotal} />
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-neutral-800">Summary</legend>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Field label="Net profit" name="netProfit" defaultValue={editing?.netProfit} />
                <Field label="Net margin (decimal)" name="netMarginPct" step="0.0001" defaultValue={editing?.netMarginPct} />
                <Field label="21% target" name="target21pct" defaultValue={editing?.target21pct} />
                <Field label="Variance to target" name="varianceToTarget" defaultValue={editing?.varianceToTarget} />
                <Field label="Owner draw" name="ownerDraw" defaultValue={editing?.ownerDraw} />
                <Field label="Ending bank balance" name="endingBankBalance" defaultValue={editing?.endingBankBalance} />
              </div>
            </fieldset>

            <p className="text-xs text-neutral-400">
              Every field is entered directly — nothing here is calculated from the others, so the numbers always
              match what you already reconciled.
            </p>

            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Save month
              </button>
              <Link
                href="/financials"
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </section>
      )}

      <section className="mb-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-medium text-neutral-900">Owner Draw Policy</h2>
          <form action={updateDrawPolicyAction} className="space-y-3">
            <Field
              label="Fixed monthly amount"
              name="fixedMonthlyAmount"
              defaultValue={drawPolicy?.fixed_monthly_amount}
            />
            <Field label="Cash floor minimum" name="cashFloorMinimum" defaultValue={drawPolicy?.cash_floor_minimum} />
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Note</label>
              <textarea
                name="note"
                defaultValue={drawPolicy?.note ?? ""}
                rows={2}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Save
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-medium text-neutral-900">Profitability Target</h2>
          <form action={updateProfitabilityTargetAction} className="space-y-3">
            <Field
              label="Target net margin (decimal, e.g. 0.21)"
              name="targetNetMarginPct"
              step="0.0001"
              defaultValue={profitabilityTarget?.target_net_margin_pct}
            />
            <Field
              label="Estimated revenue needed / month"
              name="estimatedRevenueNeededMonthly"
              defaultValue={profitabilityTarget?.estimated_revenue_needed_monthly}
            />
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Note</label>
              <textarea
                name="note"
                defaultValue={profitabilityTarget?.note ?? ""}
                rows={2}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Save
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium text-neutral-900">Loans</h2>
        <LoansManager loans={loanRows} />
      </section>
    </div>
  );
}
