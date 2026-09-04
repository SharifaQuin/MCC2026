"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  updateFieldEvaluationAction,
  deleteFieldEvaluationAction,
  FieldEvalState,
} from "@/app/actions/fieldEvaluation";
import FieldEvalFields, { FieldEvalDefaultCategory } from "@/components/FieldEvalFields";
import { findCategory } from "@/lib/fieldEval";

interface EvalCategory {
  categoryKey: string;
  score: number;
  checkedItems: string[];
  notes: string | null;
}

interface EvalEntry {
  id: string;
  fieldDate: Date;
  gradedByName: string;
  generalNotes: string | null;
  overallScore: number | null;
  categories: EvalCategory[];
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save Changes"}
    </button>
  );
}

export default function FieldEvaluationEntry({
  evaluation,
  traineeId,
}: {
  evaluation: EvalEntry;
  traineeId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const updateAction = updateFieldEvaluationAction.bind(null, evaluation.id, traineeId);
  const [state, formAction] = useFormState<FieldEvalState, FormData>(updateAction, {});

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state]);

  const defaultCategories: Record<string, FieldEvalDefaultCategory> = {};
  evaluation.categories.forEach((c) => {
    defaultCategories[c.categoryKey] = {
      score: c.score,
      checkedItems: c.checkedItems,
      notes: c.notes,
    };
  });

  if (editing) {
    return (
      <form
        action={formAction}
        className="space-y-6 rounded-lg border border-brand-200 bg-white p-5"
      >
        <FieldEvalFields
          defaultFieldDate={new Date(evaluation.fieldDate).toISOString().slice(0, 10)}
          defaultGeneralNotes={evaluation.generalNotes}
          defaultCategories={defaultCategories}
        />

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <div className="flex items-center gap-3">
          <SaveButton />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm font-medium text-neutral-500 hover:underline"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium">
          {new Date(evaluation.fieldDate).toLocaleDateString()} — Overall:{" "}
          {evaluation.overallScore}/5
        </p>
        <div className="flex items-center gap-3">
          <p className="text-xs text-neutral-400">Graded by {evaluation.gradedByName}</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={deletePending}
            onClick={() => {
              if (confirm("Delete this field evaluation? This can't be undone.")) {
                startDeleteTransition(() => deleteFieldEvaluationAction(evaluation.id, traineeId));
              }
            }}
            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
          >
            {deletePending ? "..." : "Delete"}
          </button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {evaluation.categories.map((c) => {
          const def = findCategory(c.categoryKey);
          return (
            <div key={c.categoryKey} className="rounded-md bg-neutral-50 p-2 text-sm">
              <p className="font-medium">
                {def?.label ?? c.categoryKey}: {c.score}/5
              </p>
              {c.checkedItems.length > 0 && (
                <ul className="ml-4 list-disc text-xs text-neutral-600">
                  {c.checkedItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {c.notes && <p className="mt-1 text-xs italic text-neutral-500">{c.notes}</p>}
            </div>
          );
        })}
      </div>
      {evaluation.generalNotes && (
        <p className="mt-2 text-sm italic text-neutral-600">{evaluation.generalNotes}</p>
      )}
    </div>
  );
}
