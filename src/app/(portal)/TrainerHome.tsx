import Link from "next/link";
import type { SessionPayload } from "@/lib/session";
import { loadAdminDashboard } from "@/lib/dashboard";

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const content = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-neutral-900">{value}</p>
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

// The real "home" for a Trainer — previously they skipped straight to the
// raw /trainer/employees roster with no summary first. Reuses
// loadAdminDashboard's training numbers (the same ones the owner's home
// page already shows) rather than computing anything new — a Trainer just
// doesn't also see the HR/payroll/complaint stats mixed into that function
// that aren't part of their job.
export default async function TrainerHome({ session }: { session: SessionPayload }) {
  const training = await loadAdminDashboard();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Welcome, {session.name}!</h1>
      <p className="mb-6 text-sm text-neutral-500">Here's how training is going across the team.</p>

      <div className="space-y-6">
        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">Training</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total Employees" value={training.totalEmployees} href="/trainer/employees" />
            <Stat label="In Training" value={training.inTraining} href="/trainer/employees?status=ACTIVE" />
            <Stat
              label="Completed All Training"
              value={training.completedAll}
              href="/trainer/employees?status=COMPLETED_ALL"
            />
            <Stat
              label="Pending Certification"
              value={training.pendingCertifications.length}
              href="/trainer/employees?status=PENDING_CERT"
            />
          </div>
          <Link
            href="/trainer/employees"
            className="mt-5 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            View Employees
          </Link>
        </section>

        {training.pendingCertifications.length > 0 && (
          <section className="rounded-lg border border-neutral-200 bg-white p-6">
            <h2 className="mb-3 text-lg font-medium text-neutral-900">Pending Certification</h2>
            <div className="space-y-2">
              {training.pendingCertifications.map((e) => (
                <Link
                  key={e.id}
                  href={`/trainer/employees/${e.id}`}
                  className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 p-3 hover:border-amber-300"
                >
                  <span className="font-medium text-amber-900">{e.name}</span>
                  <span className="text-xs text-amber-700">
                    Recommended {e.certRecommendedAt ? new Date(e.certRecommendedAt).toLocaleDateString() : ""}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {training.stalledEmployees.length > 0 && (
          <section className="rounded-lg border border-neutral-200 bg-white p-6">
            <h2 className="mb-1 text-lg font-medium text-neutral-900">Stalled — No Login in 7+ Days</h2>
            <p className="mb-3 text-sm text-neutral-500">Active trainees who haven't logged in recently.</p>
            <div className="space-y-2">
              {training.stalledEmployees.map((e) => (
                <Link
                  key={e.id}
                  href={`/trainer/employees/${e.id}`}
                  className="flex items-center justify-between rounded-md border border-neutral-200 p-3 hover:border-brand-300"
                >
                  <span className="font-medium">{e.name}</span>
                  <span className="text-xs text-neutral-500">
                    {e.lastLoginAt ? `Last login ${new Date(e.lastLoginAt).toLocaleDateString()}` : "Never logged in"}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="mb-1 text-lg font-medium text-neutral-900">Field Evaluations</h2>
          <p className="text-sm text-neutral-500">{training.recentEvaluations} completed in the last 30 days.</p>
          {training.noFieldEvalYet.length > 0 && (
            <p className="mt-2 text-sm text-amber-700">
              {training.noFieldEvalYet.length} trainee{training.noFieldEvalYet.length === 1 ? "" : "s"} finished all
              modules but still {training.noFieldEvalYet.length === 1 ? "has" : "have"} no field evaluation yet.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
