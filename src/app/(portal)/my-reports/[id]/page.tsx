import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getMyProblemReportDetail } from "@/lib/problemReports";
import { t } from "@/lib/i18n";
import ProblemReportFeedbackForm from "./ProblemReportFeedbackForm";

const CATEGORY_LABELS: Record<string, string> = {
  BUG_OR_ERROR: "Something's broken",
  ACCOUNT_OR_ACCESS: "Account or access issue",
  DATA_LOOKS_WRONG: "Data looks wrong",
  OTHER: "Other",
};

// Ownership is enforced inside getMyProblemReportDetail (reporterId must
// match the true actor) — a report that isn't this user's own, or doesn't
// exist, renders the same 404 either way, never a hint either way.
export default async function MyReportDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const labels = t(session.language);
  const report = await getMyProblemReportDetail(session, params.id);
  if (!report) notFound();

  const latestResolution = report.resolutions[0] ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/my-reports" className="text-sm text-brand-700 hover:underline">
        {labels.myReportsBackToList}
      </Link>

      <div className="mt-3 mb-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-neutral-900">
            {CATEGORY_LABELS[report.category] ?? report.category}
          </h1>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              report.status === "OPEN"
                ? "bg-amber-100 text-amber-700"
                : report.status === "CONFIRMED"
                  ? "bg-green-100 text-green-700"
                  : "bg-neutral-100 text-neutral-600"
            }`}
          >
            {report.status === "OPEN"
              ? labels.myReportsStatusOpen
              : report.status === "CONFIRMED"
                ? labels.myReportsStatusConfirmed
                : labels.myReportsStatusResolved}
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-400">{new Date(report.createdAt).toLocaleString()}</p>
      </div>

      <div className="rounded-md border border-neutral-200 p-4">
        <p className="whitespace-pre-wrap text-sm text-neutral-700">{report.description}</p>
      </div>

      {(report.status === "RESOLVED" || report.status === "CONFIRMED") && (
        <div className="mt-4 rounded-md border border-neutral-200 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {labels.myReportsResolutionHeading}
          </p>
          {latestResolution ? (
            <>
              <p className="whitespace-pre-wrap text-sm text-neutral-700">{latestResolution.note}</p>
              <p className="mt-1 text-xs text-neutral-400">
                {labels.myReportsResolvedOn} {new Date(latestResolution.resolvedAt).toLocaleString()}
              </p>
            </>
          ) : (
            <p className="text-sm text-neutral-500">{labels.myReportsResolutionNoNote}</p>
          )}
        </div>
      )}

      {report.status === "RESOLVED" && (
        <div className="mt-4">
          <ProblemReportFeedbackForm
            reportId={report.id}
            resolutionId={report.latestResolutionId}
            labels={{
              prompt: labels.myReportsFeedbackPrompt,
              working: labels.myReportsFeedbackWorking,
              stillBroken: labels.myReportsFeedbackStillBroken,
              notePlaceholder: labels.myReportsFeedbackNotePlaceholder,
              submit: labels.myReportsFeedbackSubmit,
              thanksWorking: labels.myReportsFeedbackThanksWorking,
              thanksStillBroken: labels.myReportsFeedbackThanksStillBroken,
            }}
          />
        </div>
      )}

      {report.feedback.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {labels.myReportsFeedbackHistoryHeading}
          </p>
          <div className="space-y-1.5">
            {report.feedback.map((f) => (
              <p key={f.id} className="text-xs text-neutral-600">
                {f.outcome === "CONFIRMED_WORKING" ? labels.myReportsFeedbackWorking : labels.myReportsFeedbackStillBroken}
                {f.note ? `: ${f.note}` : ""} — {new Date(f.createdAt).toLocaleString()}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
