import Link from "next/link";
import { getPayPeriodsOverview } from "@/lib/payroll";
import NewPayPeriodForm from "./NewPayPeriodForm";

export default async function AdminPayrollPage() {
  const periods = await getPayPeriodsOverview();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Payroll</h1>

      <div className="mb-6 space-y-3">
        {periods.length === 0 && (
          <p className="text-sm text-neutral-500">No pay periods yet.</p>
        )}
        {periods.map((p) => (
          <Link
            key={p.id}
            href={`/admin/payroll/${p.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand-300"
          >
            <div>
              <p className="font-medium">{p.label}</p>
              <p className="text-xs text-neutral-500">
                {new Date(p.startDate).toLocaleDateString()} –{" "}
                {new Date(p.endDate).toLocaleDateString()} · {p.entryCount} entr
                {p.entryCount === 1 ? "y" : "ies"}
              </p>
            </div>
            {p.disputeCount > 0 && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                {p.disputeCount} dispute{p.disputeCount === 1 ? "" : "s"}
              </span>
            )}
          </Link>
        ))}
      </div>

      <NewPayPeriodForm />
    </div>
  );
}
