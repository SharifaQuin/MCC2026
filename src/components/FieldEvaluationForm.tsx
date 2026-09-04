"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createFieldEvaluationAction, FieldEvalState } from "@/app/actions/fieldEvaluation";
import { FIELD_EVAL_CATEGORIES } from "@/lib/fieldEval";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save Field Evaluation"}
    </button>
  );
}

export default function FieldEvaluationForm({ traineeId }: { traineeId: string }) {
  const [open, setOpen] = useState(false);
  const action = createFieldEvaluationAction.bind(null, traineeId);
  const [state, formAction] = useFormState<FieldEvalState, FormData>(action, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        + Log Field Day Evaluation
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-6 rounded-lg border border-neutral-200 bg-white p-5">
      <div>
        <label className="mb-1 block text-sm font-medium">Field Day Date</label>
        <input
          type="date"
          name="fieldDate"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      {FIELD_EVAL_CATEGORIES.map((cat) => (
        <fieldset key={cat.key} className="rounded-md border border-neutral-200 p-4">
          <legend className="px-1 font-medium">{cat.label}</legend>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              Score (1 = needs significant work, 5 = excellent)
            </label>
            <select
              name={`score_${cat.key}`}
              required
              defaultValue=""
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select a score
              </option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3 space-y-1">
            <p className="text-xs font-medium text-neutral-500">Observed behaviors</p>
            {cat.checklistItems.map((item, i) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`check_${cat.key}_${i}`} className="h-4 w-4" />
                {item}
              </label>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              Notes (internal only, not shown to employee)
            </label>
            <textarea
              name={`notes_${cat.key}`}
              rows={2}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </fieldset>
      ))}

      <div>
        <label className="mb-1 block text-sm font-medium">
          General Notes (internal only, not shown to employee)
        </label>
        <textarea
          name="generalNotes"
          rows={3}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && (
        <p className="text-sm text-green-700">Evaluation saved.</p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-medium text-neutral-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
