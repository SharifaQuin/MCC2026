"use client";

import { useState, useTransition } from "react";
import type { ApplicantStage } from "@prisma/client";
import { setApplicantStageAction, rejectApplicantAction } from "../actions";
import { STAGE_LABELS, SCHEDULING_STAGES } from "@/lib/recruiting";

// Phase 1 keeps stage changes manual — a manager reviews and moves the
// applicant forward themselves. Automated scheduling/messaging on these
// transitions comes in a later phase.
// Prescreen Passed and later can jump straight to scheduling the in-person
// interview, skipping the phone screen entirely — e.g. a strong referral or
// walk-in who the manager already wants to just bring in.
const NEXT_STAGES: Record<string, ApplicantStage[]> = {
  NEW: ["PRESCREEN_PASSED", "PRESCREEN_FAILED"],
  PRESCREEN_PASSED: ["PHONE_INTERVIEW_SCHEDULED", "IN_PERSON_SCHEDULED", "REJECTED", "BENCH"],
  PRESCREEN_FAILED: ["REJECTED", "BENCH", "PRESCREEN_PASSED"],
  // Recruiting 2.0's own "Invite to Interview" button is what normally
  // moves someone into this stage (see the Recruiting Inbox) — these are
  // just the manual fallbacks if staff need to override from here.
  INTERVIEW_INVITE_SENT: ["IN_PERSON_SCHEDULED", "PHONE_INTERVIEW_SCHEDULED", "REJECTED", "BENCH"],
  PHONE_INTERVIEW_SCHEDULED: ["PHONE_INTERVIEW_PASSED", "PHONE_INTERVIEW_FAILED", "IN_PERSON_SCHEDULED"],
  PHONE_INTERVIEW_PASSED: ["IN_PERSON_SCHEDULED", "REJECTED", "BENCH"],
  PHONE_INTERVIEW_FAILED: ["REJECTED", "BENCH", "IN_PERSON_SCHEDULED"],
  IN_PERSON_SCHEDULED: ["IN_PERSON_PASSED", "IN_PERSON_FAILED"],
  IN_PERSON_PASSED: ["OFFER_SENT", "REJECTED", "BENCH"],
  IN_PERSON_FAILED: ["REJECTED", "BENCH"],
  OFFER_SENT: ["HIRED", "REJECTED"],
  // A misclick straight to Hired is exactly the kind of mistake that used
  // to have no way back — moving back to Offer Sent walks it off cleanly
  // (see the Hired-exit cleanup in setApplicantStageAction).
  HIRED: ["OFFER_SENT"],
  REJECTED: ["BENCH"],
  BENCH: ["PHONE_INTERVIEW_SCHEDULED"],
};

const ALL_STAGES = Object.keys(STAGE_LABELS) as ApplicantStage[];

export default function StageControls({
  applicantId,
  stage,
}: {
  applicantId: string;
  stage: ApplicantStage;
}) {
  const [pending, startTransition] = useTransition();
  const [scheduling, setScheduling] = useState<ApplicantStage | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const options = NEXT_STAGES[stage] ?? [];

  return (
    <div className="space-y-3">
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((next) => (
            <button
              key={next}
              type="button"
              disabled={pending}
              onClick={() => {
                if (next === "REJECTED") {
                  setRejecting(true);
                } else if ((SCHEDULING_STAGES as string[]).includes(next)) {
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
              {stage === "HIRED" && next === "OFFER_SENT" ? "Undo Hire" : `Move to: ${STAGE_LABELS[next]}`}
            </button>
          ))}
        </div>
      )}
      {stage === "HIRED" && (
        <p className="text-xs text-neutral-500">
          Undo Hire moves this applicant back to Offer Sent. If the training account created for
          them has never been logged into, it&apos;s removed too — nothing is touched if they&apos;ve
          already started using it.
        </p>
      )}

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

      {rejecting && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await rejectApplicantAction(applicantId, true);
                setRejecting(false);
              })
            }
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? "..." : "Reject & Send Email"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await rejectApplicantAction(applicantId, false);
                setRejecting(false);
              })
            }
            className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            Reject (No Email)
          </button>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="border-t border-neutral-100 pt-3">
        {overriding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const target = formData.get("targetStage") as ApplicantStage | null;
              if (!target || target === stage) {
                setOverriding(false);
                return;
              }
              startTransition(async () => {
                await setApplicantStageAction(applicantId, target);
                setOverriding(false);
              });
            }}
            className="rounded-md border border-neutral-200 bg-neutral-50 p-3"
          >
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Set the stage directly — for correcting a wrong click. Any interview date/time already
              on file is left as-is.
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                name="targetStage"
                defaultValue={stage}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                {ALL_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {pending ? "Saving..." : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setOverriding(false)}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOverriding(true)}
            className="text-xs font-medium text-neutral-500 underline hover:text-neutral-700"
          >
            Made a mistake? Correct the stage manually
          </button>
        )}
      </div>
    </div>
  );
}
