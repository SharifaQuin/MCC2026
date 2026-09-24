"use client";

import Link from "next/link";
import { useTransition } from "react";
import Button from "@/components/ds/Button";
import { setApplicantStageAction, rejectApplicantAction } from "../actions";

// Recruiting 2.0's Interview Decision screen — the five choices Shar
// actually has once she's met a candidate, all one tap away. Working
// Session / Additional Screening don't force a stage change (Shar may want
// to look at the existing forms before deciding); Hire, Talent Pool, and
// Not Moving Forward do.
export default function InterviewDecisionPanel({ applicantId }: { applicantId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-2xl border border-gold-300 bg-gold-50 p-5">
      <h2 className="mb-1 font-semibold text-brand-800">Interview Decision</h2>
      <p className="mb-4 text-sm text-neutral-600">What would you like to do with this candidate?</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          variant="primary"
          disabled={pending}
          onClick={() => startTransition(() => setApplicantStageAction(applicantId, "HIRED"))}
        >
          Hire
        </Button>
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
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => startTransition(() => setApplicantStageAction(applicantId, "BENCH"))}
        >
          Talent Pool
        </Button>
        <Button
          variant="danger"
          className="sm:col-span-2"
          disabled={pending}
          onClick={() => startTransition(() => rejectApplicantAction(applicantId, true))}
        >
          Not Moving Forward
        </Button>
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Additional Screening also covers References and Interview Scorecards — all on the tabs above.
      </p>
    </div>
  );
}
