import type { CalendarSyncProblem } from "@/lib/calendar";

// Pulled out from the applicant detail page as its own small, pure,
// synchronous component specifically so it's directly render-testable (see
// scripts/verify-calendar-event-reuse.ts) without a live calendar
// integration — this environment has no real Microsoft Graph credentials
// anywhere, so `problem` can never actually be "stale" in a live browser
// test here; rendering this component directly with a fake `problem` is
// how "the warning appears when an id exists but the update failed" gets
// proven in practice.
export default function CalendarSyncBanner({
  problem,
  applicantId,
  canEdit,
  retryAction,
}: {
  problem: CalendarSyncProblem;
  applicantId: string;
  canEdit: boolean;
  retryAction: (applicantId: string) => Promise<void>;
}) {
  if (!problem) return null;

  return (
    <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <span>
        {problem === "stale"
          ? "⚠ Calendar sync failed — the shared Outlook calendar may still show the old time. Retrying updates this same invite, never a second one."
          : "⚠ Calendar invite missing — the shared Outlook calendar never got this event, even though the candidate's own email/text confirmation went out."}
      </span>
      {canEdit && (
        <form action={retryAction.bind(null, applicantId)}>
          <button
            type="submit"
            className="whitespace-nowrap rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100"
          >
            Retry calendar sync
          </button>
        </form>
      )}
    </div>
  );
}
