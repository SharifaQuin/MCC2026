"use client";

import { useTransition } from "react";
import type { ApplicantStage } from "@prisma/client";
import { setApplicantStageAction } from "../actions";
import { STAGE_LABELS } from "@/lib/recruiting";

// Phase 1: manual stage moves only, grouped by what makes sense from the
// applicant's *current* stage. Automated scheduling/messaging on these
// transitions comes in a later phase.
const NEXT_STAGES: Record<string, ApplicantStage[]> = {
  NEW: ["PRESCREEN_PASSED", "PRESCREEN_FAILED"],
  PRESCREEN_PASSED: ["PHONE_INTERVIEW_SCHEDULED", "REJECTED", "BENCH"],
  PRESCREEN_FAILED: ["REJECTED", "BENCH", "PRESCREEN_PASSED"],
  PHONE_INTERVIEW_SCHEDULED: ["PHONE_INTERVIEW_PASSED", "PHONE_INTERVIEW_FAILED"],
  PHONE_INTERVIEW_PASSED: ["IN_PERSON_SCHEDULED", "REJECTED", "BENCH"],
  PHONE_INTERVIEW_FAILED: ["REJECTED", "BENCH"],
  IN_PERSON_SCHEDULED: ["IN_PERSON_PASSED", "IN_PERSON_FAILED"],
  IN_PERSON_PASSED: ["OFFER_SENT", "REJECTED", "BENCH"],
  IN_PERSON_FAILED: ["REJECTED", "BENCH"],
  OFFER_SENT: ["HIRED", "REJECTED"],
  HIRED: [],
  REJECTED: ["BENCH"],
  BENCH: ["PHONE_INTERVIEW_SCHEDULED"],
};

export default function StageControls({
  applicantId,
  stage,
}: {
  applicantId: string;
  stage: ApplicantStage;
}) {
  const [pending, startTransition] = useTransition();
  const options = NEXT_STAGES[stage] ?? [];

  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((next) => (
        <button
          key={next}
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setApplicantStageAction(applicantId, next))}
          className={`rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60 ${
            next === "REJECTED"
              ? "border border-red-300 text-red-700 hover:bg-red-50"
              : next === "BENCH"
                ? "border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                : "bg-brand-600 text-white hover:bg-brand-700"
          }`}
        >
          Move to: {STAGE_LABELS[next]}
        </button>
      ))}
    </div>
  );
}
