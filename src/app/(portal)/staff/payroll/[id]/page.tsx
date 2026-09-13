import Link from "next/link";
import { notFound } from "next/navigation";
import { getPayPeriodDetail } from "@/lib/payroll";
import CsvImportForm from "./CsvImportForm";
import PayrollRowsTable from "./PayrollRowsTable";

export default async function AdminPayPeriodPage({ params }: { params: { id: string } }) {
  const detail = await getPayPeriodDetail(params.id);
  if (!detail) notFound();

  const { payPeriod, rows } = detail;
  const disputeCount = rows.filter((r) => r.entry?.status === "DISPUTED").length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/staff/payroll" className="mb-3 inline-block text-sm text-brand-700 hover:underline">
          ← Back to Payroll
        </Link>
        <h1 className="text-2xl font-semibold">{payPeriod.label}</h1>
        <p className="text-sm text-neutral-500">
          {new Date(payPeriod.startDate).toLocaleDateString()} –{" "}
          {new Date(payPeriod.endDate).toLocaleDateString()}
          {disputeCount > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
              {disputeCount} dispute{disputeCount === 1 ? "" : "s"} to review
            </span>
          )}
        </p>
      </div>

      <CsvImportForm payPeriodId={payPeriod.id} />

      <PayrollRowsTable payPeriodId={payPeriod.id} rows={rows} />
    </div>
  );
}
