import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getEmployeePayrollEntries } from "@/lib/payroll";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  DISPUTED: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Needs Your Review",
  APPROVED: "Approved",
  DISPUTED: "Question Submitted",
};

export default async function PayrollPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const entries = await getEmployeePayrollEntries(session.sub);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Payroll</h1>

      {entries.length === 0 ? (
        <p className="text-sm text-neutral-500">No pay periods yet.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <Link
              key={e.id}
              href={`/payroll/${e.id}`}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand-300"
            >
              <div>
                <p className="font-medium">{e.payPeriodLabel}</p>
                <p className="text-xs text-neutral-500">
                  {e.regularHours}h regular
                  {e.overtimeHours > 0 ? ` + ${e.overtimeHours}h overtime` : ""}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[e.status]}`}>
                {STATUS_LABELS[e.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
