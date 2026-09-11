import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getPayrollEntryDetail } from "@/lib/payroll";
import { signPayrollEntryAction, disputePayrollEntryAction } from "@/app/actions/payroll";

export default async function PayrollEntryPage({ params }: { params: { entryId: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const entry = await getPayrollEntryDetail(params.entryId, session.sub);
  if (!entry) notFound();

  const signAction = signPayrollEntryAction.bind(null, entry.id);
  const disputeAction = disputePayrollEntryAction.bind(null, entry.id);

  return (
    <div>
      <Link href="/payroll" className="mb-3 inline-block text-sm text-brand-700 hover:underline">
        ← Back to Payroll
      </Link>
      <h1 className="mb-1 text-2xl font-semibold">{entry.payPeriodLabel}</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {new Date(entry.startDate).toLocaleDateString()} – {new Date(entry.endDate).toLocaleDateString()}
      </p>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-neutral-400">Regular hours</dt>
            <dd className="text-lg font-medium">{entry.regularHours}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Overtime hours</dt>
            <dd className="text-lg font-medium">{entry.overtimeHours}</dd>
          </div>
        </dl>

        {entry.attachmentDataUrl && (
          <div className="mt-4 border-t border-neutral-200 pt-4">
            <a
              href={entry.attachmentDataUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              View attached document{entry.attachmentFileName ? ` (${entry.attachmentFileName})` : ""}
            </a>
          </div>
        )}
      </div>

      {entry.resolutionNotes && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
          <p className="font-medium">A note from HR:</p>
          <p>{entry.resolutionNotes}</p>
        </div>
      )}

      {entry.status === "APPROVED" && (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Approved by <span className="font-medium">{entry.signedName}</span>.
        </div>
      )}

      {entry.status === "DISPUTED" && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Your question has been sent to HR:</p>
          <p className="mt-1">{entry.disputeNote}</p>
          <p className="mt-2 text-xs text-red-700">
            HR will follow up, then send this back for you to review again.
          </p>
        </div>
      )}

      {entry.status === "PENDING" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <form action={signAction} className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
              Approve & Sign
            </h2>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Type your full legal name to sign
            </label>
            <input
              type="text"
              name="signedName"
              defaultValue={session.name}
              required
              className="mb-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <label className="mb-4 flex items-start gap-2 text-sm text-neutral-700">
              <input type="checkbox" name="agreed" required className="mt-1 h-4 w-4" />
              <span>I confirm these hours are accurate.</span>
            </label>
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Approve & Sign
            </button>
          </form>

          <form action={disputeAction} className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
              Flag a Question
            </h2>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              What looks off?
            </label>
            <textarea
              name="disputeNote"
              required
              rows={4}
              className="mb-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-red-300 px-5 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Send to HR
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
