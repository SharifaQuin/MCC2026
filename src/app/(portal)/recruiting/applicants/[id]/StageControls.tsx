"use client";

import { useState, useTransition } from "react";
import type { ApplicantStage } from "@prisma/client";
import { setApplicantStageAction } from "../actions";
import { STAGE_LABELS, SCHEDULING_STAGES } from "@/lib/recruiting";

// Phase 1 keeps stage changes manual — a manager reviews and moves the
// applicant forward themselves. Automated scheduling/messaging on these
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
  const [scheduling, setScheduling] = useState<ApplicantStage | null>(null);
  const options = NEXT_STAGES[stage] ?? [];

  if (options.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((next) => (
          <button
            key={next}
            type="button"
            disabled={pending}
            onClick={() => {
              if ((SCHEDULING_STAGES as string[]).includes(next)) {
                setScheduling(next);
              } else {
                startTransition(() => setApplicantStageAction(applicantId, next));
              }
            }}
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

      {scheduling && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const date = String(formData.get("scheduledDate") ?? "");
            const time = String(formData.get("scheduledTime") ?? "");
            if (!date || !time) return;
            startTransition(async () => {
              await setApplicantStageAction(applicantId, scheduling, `${date}T${time}`);
              setScheduling(null);
            });
          }}
          className="rounded-md border border-neutral-200 bg-neutral-50 p-3"
        >
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            When is the {STAGE_LABELS[scheduling]}?{" "}
            <span className="font-normal text-neutral-500">(Pacific Time)</span>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <input
              type="date"
              name="scheduledDate"
              required
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              type="time"
              name="scheduledTime"
              required
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Saving..." : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setScheduling(null)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
