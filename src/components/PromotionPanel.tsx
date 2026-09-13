"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createPromotionAssessmentAction, deletePromotionAssessmentAction, PromotionAssessmentState } from "@/app/actions/promotions";
import {
  READINESS_INDICATORS_BY_ROLE,
  TARGET_ROLE_LABELS,
  PROMOTION_DECISION_LABELS,
  defaultReadinessIndicators,
  requiresDriverDocuments,
  type ReadinessIndicatorValue,
} from "@/lib/promotions";
import type { PromotionTargetRole, PromotionDecision } from "@prisma/client";

export interface PromotionAssessmentRow {
  id: string;
  targetRole: PromotionTargetRole;
  readinessIndicators: ReadinessIndicatorValue[];
  decision: PromotionDecision;
  developmentPlan: string | null;
  reassessmentDate: string | null;
  payDifferential: number | null;
  assessedByName: string;
  assessedAt: string;
}

const DECISION_STYLES: Record<PromotionDecision, string> = {
  PROMOTE: "bg-green-100 text-green-700",
  DEVELOP: "bg-amber-100 text-amber-700",
  STAY: "bg-neutral-100 text-neutral-600",
  ADDRESS: "bg-red-100 text-red-700",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save Assessment"}
    </button>
  );
}

function NewAssessmentForm({
  employeeId,
  canSetPayDifferential,
  onClose,
}: {
  employeeId: string;
  canSetPayDifferential: boolean;
  onClose: () => void;
}) {
  const action = createPromotionAssessmentAction.bind(null, employeeId);
  const [state, formAction] = useFormState<PromotionAssessmentState, FormData>(action, {});
  const [targetRole, setTargetRole] = useState<PromotionTargetRole>("ASSISTANT");
  const [indicators, setIndicators] = useState<ReadinessIndicatorValue[]>(defaultReadinessIndicators("ASSISTANT"));
  const [decision, setDecision] = useState<PromotionDecision>("STAY");

  if (state.success) onClose();

  function changeRole(role: PromotionTargetRole) {
    setTargetRole(role);
    setIndicators(defaultReadinessIndicators(role));
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <input type="hidden" name="readinessIndicatorsJson" value={JSON.stringify(indicators)} />

      <div>
        <label className="mb-1 block text-xs font-medium">Target role</label>
        <select
          name="targetRole"
          value={targetRole}
          onChange={(e) => changeRole(e.target.value as PromotionTargetRole)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {Object.entries(TARGET_ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {requiresDriverDocuments(targetRole) && (
          <p className="mt-1 text-xs text-amber-700">
            Lead requires a valid CA driver&apos;s license and active insurance on file.
          </p>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium">Readiness indicators</p>
        <div className="space-y-1.5 rounded-md bg-neutral-50 p-3">
          {indicators.map((ind, i) => (
            <label key={i} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={ind.met}
                onChange={(e) => {
                  const next = [...indicators];
                  next[i] = { ...next[i], met: e.target.checked };
                  setIndicators(next);
                }}
                className="mt-0.5"
              />
              <span>{ind.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium">Decision</label>
        <select
          name="decision"
          value={decision}
          onChange={(e) => setDecision(e.target.value as PromotionDecision)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {Object.entries(PROMOTION_DECISION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {decision === "DEVELOP" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium">Development plan</label>
            <textarea
              name="developmentPlan"
              required
              rows={3}
              placeholder="What specifically needs to improve, and how?"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Reassessment date</label>
            <input
              type="date"
              name="reassessmentDate"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </>
      )}

      {canSetPayDifferential && decision === "PROMOTE" && (
        <div>
          <label className="mb-1 block text-xs font-medium">Approved pay differential ($/hr, optional)</label>
          <input
            type="number"
            step="0.01"
            name="payDifferential"
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

export default function PromotionPanel({
  employeeId,
  assessments,
  canSetPayDifferential,
}: {
  employeeId: string;
  assessments: PromotionAssessmentRow[];
  canSetPayDifferential: boolean;
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
          + New Assessment
        </button>
      )}

      {open && (
        <NewAssessmentForm
          employeeId={employeeId}
          canSetPayDifferential={canSetPayDifferential}
          onClose={() => setOpen(false)}
        />
      )}

      {assessments.length === 0 ? (
        <p className="text-sm text-neutral-500">No promotion assessments yet.</p>
      ) : (
        <div className="space-y-3">
          {assessments.map((a) => (
            <div key={a.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    Target: {TARGET_ROLE_LABELS[a.targetRole]}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {new Date(a.assessedAt).toLocaleDateString()} · assessed by {a.assessedByName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${DECISION_STYLES[a.decision]}`}>
                    {PROMOTION_DECISION_LABELS[a.decision]}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Delete this assessment record?")) {
                        deletePromotionAssessmentAction(a.id, employeeId);
                      }
                    }}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <ul className="mt-3 space-y-1 text-xs text-neutral-600">
                {a.readinessIndicators.map((ind, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className={ind.met ? "text-green-600" : "text-neutral-400"}>{ind.met ? "✓" : "○"}</span>
                    {ind.label}
                  </li>
                ))}
              </ul>

              {a.decision === "DEVELOP" && (
                <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                  <p className="font-medium">Development plan</p>
                  <p className="mt-1">{a.developmentPlan}</p>
                  {a.reassessmentDate && (
                    <p className="mt-1">Reassess by {new Date(a.reassessmentDate).toLocaleDateString()}</p>
                  )}
                </div>
              )}

              {canSetPayDifferential && a.payDifferential !== null && (
                <p className="mt-3 text-xs text-neutral-600">
                  Approved pay differential: <strong>${a.payDifferential.toFixed(2)}/hr</strong>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
