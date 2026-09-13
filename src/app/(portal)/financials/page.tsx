import Link from "next/link";
import {
  getMonthlyFinancials,
  getOwnerSettings,
  getChecklistTasksForRole,
  getLoans,
} from "@/lib/financials";
import {
  upsertMonthlyFinancialsAction,
  updateDrawPolicyAction,
  updateProfitabilityTargetAction,
} from "@/app/actions/financials";
import ChecklistManager from "./ChecklistManager";
import LoansManager from "./LoansManager";

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
}: {
  label: string;
  name: string;
  defaultValue?: number | string | null;
  step?: string;
  optional?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-600">
        {label}
        {optional ? " (optional)" : ""}
      </label>
      <input
        type={typeof defaultValue === "string" ? "text" : "number"}
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
  searchParams: { month?: string };
}) {
  const [months, ownerSettings, checklistTasks, loans] = await Promise.all([
    getMonthlyFinancials(),
    getOwnerSettings(),
    getChecklistTasksForRole("ADMIN"),
    getLoans(),
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

  const checklistRows = checklistTasks.map((t) => ({
    id: t.id,
    frequency: t.frequency,
    task: t.task,
    owner: t.owner,
    visibility: t.visibility,
    effectiveStatus: t.effectiveStatus,
    category: t.category,
    notes: t.notes,
    targetDate: t.targetDate ? t.targetDate.toISOString() : null,
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Financials</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Owner-only — full monthly P&amp;L history, targets, and settings.
      </p>

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
              <Field label="Month (YYYY-MM)" name="month" defaultValue={editing?.month ?? ""} readOnly={!isNew} />
              <Field label="Month label (e.g. Jan)" name="monthLabel" defaultValue={editing?.monthLabel ?? ""} />
            </div>

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

      <section className="mb-8 rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium text-neutral-900">Loans</h2>
        <LoansManager loans={loanRows} />
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium text-neutral-900">Checklist</h2>
        <ChecklistManager tasks={checklistRows} />
      </section>
    </div>
  );
}
