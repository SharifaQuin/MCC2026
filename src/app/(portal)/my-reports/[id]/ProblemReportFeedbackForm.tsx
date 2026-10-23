"use client";

import { useState, useTransition } from "react";
import { submitProblemReportFeedbackAction } from "@/app/actions/problemReports";
import type { ProblemReportFeedbackOutcome } from "@prisma/client";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong — please try again.";
}

// Only ever rendered for a RESOLVED report, server-side, with the exact
// resolutionId that report had at the moment this page was rendered — if
// the owner reopens and resolves again before this is submitted, the
// server action's own atomic check rejects it as stale rather than silently
// applying it to the wrong resolution (see submitProblemReportFeedback).
export default function ProblemReportFeedbackForm({
  reportId,
  resolutionId,
  labels,
}: {
  reportId: string;
  resolutionId: string | null;
  labels: {
    prompt: string;
    working: string;
    stillBroken: string;
    notePlaceholder: string;
    submit: string;
    thanksWorking: string;
    thanksStillBroken: string;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [showNoteFor, setShowNoteFor] = useState<ProblemReportFeedbackOutcome | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ProblemReportFeedbackOutcome | null>(null);

  function submit(outcome: ProblemReportFeedbackOutcome, noteText: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitProblemReportFeedbackAction(reportId, resolutionId, outcome, noteText);
        if (result.ok) setDone(outcome);
        else setError(result.error ?? "Couldn't send your feedback.");
      } catch (err) {
        setError(describeError(err));
      }
    });
  }

  if (done) {
    return (
      <p className="text-sm font-medium text-green-700">
        {done === "CONFIRMED_WORKING" ? labels.thanksWorking : labels.thanksStillBroken}
      </p>
    );
  }

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <p className="mb-2 text-sm font-medium text-neutral-700">{labels.prompt}</p>
      {error && <p className="mb-2 text-xs font-medium text-red-700">{error}</p>}

      {showNoteFor === "STILL_BROKEN" ? (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={labels.notePlaceholder}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => submit("STILL_BROKEN", note)}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "..." : labels.submit}
            </button>
            <button
              type="button"
              onClick={() => setShowNoteFor(null)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("CONFIRMED_WORKING", "")}
            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {labels.working}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setShowNoteFor("STILL_BROKEN")}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {labels.stillBroken}
          </button>
        </div>
      )}
    </div>
  );
}
