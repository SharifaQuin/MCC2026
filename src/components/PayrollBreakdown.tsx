import type { PayrollAdjustmentView, PayrollJobLineView, PayrollReportTotals } from "@/lib/payroll";

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit" });
}

// Renders nothing for entries that were entered manually or imported from a
// plain CSV — those never populate reportTotals. Only entries imported from
// the scheduling platform's payroll report workbook get this detail.
export default function PayrollBreakdown({
  reportTotals,
  jobLines,
  adjustments,
}: {
  reportTotals: PayrollReportTotals | null;
  jobLines: PayrollJobLineView[];
  adjustments: PayrollAdjustmentView[];
}) {
  if (!reportTotals) return null;

  const adjustmentsByType = new Map<string, number>();
  for (const a of adjustments) {
    adjustmentsByType.set(a.type, (adjustmentsByType.get(a.type) ?? 0) + a.amount);
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <dt className="text-xs text-neutral-400">Payout</dt>
          <dd className="font-medium">{money(reportTotals.totalPayout)}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Jobs</dt>
          <dd className="font-medium">{money(reportTotals.jobsPayout)}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Adjustments</dt>
          <dd className="font-medium">{money(reportTotals.adjustmentsPayout)}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Time</dt>
          <dd className="font-medium">{reportTotals.totalHours.toFixed(2)}h</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Avg Pay/Hr</dt>
          <dd className="font-medium">{money(reportTotals.avgPayPerHour)}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Estimated Time</dt>
          <dd className="font-medium">{reportTotals.estimatedHours.toFixed(2)}h</dd>
        </div>
      </div>

      {adjustmentsByType.size > 0 && (
        <div className="flex flex-wrap gap-4 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
          {Array.from(adjustmentsByType.entries()).map(([type, amount]) => (
            <div key={type}>
              <dt className="text-xs text-neutral-400">{type}</dt>
              <dd className="font-medium">{money(amount)}</dd>
            </div>
          ))}
        </div>
      )}

      {jobLines.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Jobs</h3>
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Clock In</th>
                  <th className="px-3 py-2">Clock Out</th>
                  <th className="px-3 py-2">Actual</th>
                  <th className="px-3 py-2">Service Time</th>
                  <th className="px-3 py-2">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {jobLines.map((j) => (
                  <tr key={j.id}>
                    <td className="px-3 py-2 font-medium text-neutral-800">{j.customer}</td>
                    <td className="px-3 py-2 text-neutral-600">{j.serviceType}</td>
                    <td className="px-3 py-2 text-neutral-600">{formatDate(j.performedDate)}</td>
                    <td className="px-3 py-2 text-neutral-600">{j.clockIn}</td>
                    <td className="px-3 py-2 text-neutral-600">{j.clockOut}</td>
                    <td className="px-3 py-2 text-neutral-600">{j.actualTimeHours.toFixed(2)}h</td>
                    <td className="px-3 py-2 text-neutral-600">{j.serviceTimeHours.toFixed(2)}h</td>
                    <td className="px-3 py-2 font-medium text-neutral-800">{money(j.payout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adjustments.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Adjustments (bonuses, mileage, tips, travel time)
          </h3>
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 font-medium text-neutral-800">{a.type}</td>
                    <td className="px-3 py-2 text-neutral-600">{a.description}</td>
                    <td className="px-3 py-2 text-neutral-600">{formatDate(a.date)}</td>
                    <td className="px-3 py-2 text-neutral-600">{money(a.amount)}</td>
                    <td className="px-3 py-2 text-neutral-600">{a.hours !== 0 ? `${a.hours.toFixed(2)}h` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
