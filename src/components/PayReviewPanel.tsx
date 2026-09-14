"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createPayReviewAssessmentAction,
  deletePayReviewAssessmentAction,
  PayReviewAssessmentState,
} from "@/app/actions/payReviews";
import { PAY_REVIEW_DECISION_LABELS } from "@/lib/payReviews";
import type { PayReviewDecision } from "@prisma/client";

export interface PayReviewAssessmentRow {
  id: string;
  currentPay: number;
  recommendedPay: number;
  justification: string;
  decision: PayReviewDecision;
  effectiveDate: string | null;
  reviewedByName: string;
  reviewedAt: string;
}

const DECISION_STYLES: Record<PayReviewDecision, string> = {
  APPROVED: "bg-green-100 text-green-700",
  DENIED: "bg-red-100 text-red-700",
  DEFERRED: "bg-amber-100 text-amber-700",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save Review"}
    </button>
  );
}

function NewPayReviewForm({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const action = createPayReviewAssessmentAction.bind(null, employeeId);
  const [state, formAction] = useFormState<PayReviewAssessmentState, FormData>(action, {});
  const [decision, setDecision] = useState<PayReviewDecision>("DEFERRED");

  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Current pay ($/hr)</label>
          <input
            type="number"
            step="0.01"
            name="currentPay"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Recommended pay ($/hr)</label>
          <input
            type="number"
            step="0.01"
            name="recommendedPay"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium">Justification</label>
        <textarea
          name="justification"
          required
          rows={3}
          placeholder="Why is this raise recommended (or not)?"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium">Decision</label>
        <select
          name="decision"
          value={decision}
          onChange={(e) => setDecision(e.target.value as PayReviewDecision)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {Object.entries(PAY_REVIEW_DECISION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {decision === "APPROVED" && (
        <div>
          <label className="mb-1 block text-xs font-medium">Effective date</label>
          <input
            type="date"
            name="effectiveDate"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton />
        <button type="button" onClick={onClose} className="text-sm font-medium text-neutral-500 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function PayReviewPanel({
  employeeId,
  assessments,
}: {
  employeeId: string;
  assessments: PayReviewAssessmentRow[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New Pay Review
        </button>
      )}

      {open && <NewPayReviewForm employeeId={employeeId} onClose={() => setOpen(false)} />}

      {assessments.length === 0 ? (
        <p className="text-sm text-neutral-500">No pay reviews yet.</p>
      ) : (
        <div className="space-y-3">
          {assessments.map((a) => (
            <div key={a.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    ${a.currentPay.toFixed(2)}/hr → ${a.recommendedPay.toFixed(2)}/hr
                  </p>
                  <p className="text-xs text-neutral-500">
                    {new Date(a.reviewedAt).toLocaleDateString()} · reviewed by {a.reviewedByName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${DECISION_STYLES[a.decision]}`}>
                    {PAY_REVIEW_DECISION_LABELS[a.decision]}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Delete this pay review record?")) {
                        deletePayReviewAssessmentAction(a.id, employeeId);
                      }
                    }}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <p className="mt-3 text-xs text-neutral-600">{a.justification}</p>

              {a.decision === "APPROVED" && a.effectiveDate && (
                <p className="mt-3 text-xs text-green-700">
                  Effective {new Date(a.effectiveDate).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
