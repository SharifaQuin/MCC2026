"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import Button from "@/components/ds/Button";
import { setApplicantStageAction, rejectApplicantAction } from "../actions";

const FALLBACK_ERROR = "Something went wrong — please try again.";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : FALLBACK_ERROR;
}

// Recruiting 2.0's Interview Decision screen — the choices Shar actually has
// once she's met a candidate, all one tap away. Working Session / Additional
// Screening don't force a stage change (Shar may want to look at the
// existing forms before deciding); Hire, Talent Pool, and Not Moving Forward
// do.
export default function InterviewDecisionPanel({
  applicantId,
  canDirectlyReject,
  canRequestRejection,
}: {
  applicantId: string;
  // False for an Office Assistant — Hire and Talent Pool are both in
  // OFFICE_ASSISTANT_BLOCKED_STAGES (need the authorized manager), and
  // rejectApplicantAction refuses this role outright, so all three are
  // replaced with "Request rejection" into the Approval Requests composer
  // instead of controls that would just fail. Working Session and
  // Additional Screening don't change the stage at all, so they're
  // unaffected by this and stay for every role.
  canDirectlyReject: boolean;
  // Only meaningful when canDirectlyReject is false — see StageControls'
  // own prop of the same name.
  canRequestRejection: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function moveTo(stage: "HIRED" | "BENCH") {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setApplicantStageAction(applicantId, stage);
        if (!result.ok) setError(result.error ?? FALLBACK_ERROR);
      } catch (err) {
        setError(describeError(err));
      }
    });
  }

  function rejectDirectly() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await rejectApplicantAction(applicantId, true);
        if (!result.ok) setError(result.error ?? FALLBACK_ERROR);
      } catch (err) {
        setError(describeError(err));
      }
    });
  }

  return (
    <div className="rounded-2xl border border-gold-300 bg-gold-50 p-5">
      <h2 className="mb-1 font-semibold text-brand-800">Interview Decision</h2>
      <p className="mb-4 text-sm text-neutral-600">What would you like to do with this candidate?</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {canDirectlyReject && (
          <Button variant="primary" disabled={pending} onClick={() => moveTo("HIRED")}>
            Hire
          </Button>
        )}
        <Link
          href={`/recruiting/applicants/${applicantId}?tab=working-session`}
          className="flex items-center justify-center rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          Working Session
        </Link>
        <Link
          href={`/recruiting/applicants/${applicantId}?tab=phone`}
          className="flex items-center justify-center rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          Additional Screening
        </Link>
        {canDirectlyReject && (
          <Button variant="secondary" disabled={pending} onClick={() => moveTo("BENCH")}>
            Talent Pool
          </Button>
        )}
        {canDirectlyReject ? (
          <Button variant="danger" className="sm:col-span-2" disabled={pending} onClick={rejectDirectly}>
            Not Moving Forward
          </Button>
        ) : (
          canRequestRejection && (
            <Link
              href={`/recruiting/applicants/${applicantId}?rejectRequest=1#approval-requests`}
              className="flex items-center justify-center rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 sm:col-span-2"
            >
              Request rejection
            </Link>
          )
        )}
      </div>
      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
      <p className="mt-3 text-xs text-neutral-500">
        Additional Screening also covers References and Interview Scorecards — all on the tabs above.
      </p>
    </div>
  );
}
