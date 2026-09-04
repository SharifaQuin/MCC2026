"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createFieldEvaluationAction, FieldEvalState } from "@/app/actions/fieldEvaluation";
import FieldEvalFields from "@/components/FieldEvalFields";

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

function CreateEvalForm({ traineeId, onClose }: { traineeId: string; onClose: () => void }) {
  const action = createFieldEvaluationAction.bind(null, traineeId);
  const [state, formAction] = useFormState<FieldEvalState, FormData>(action, {});

  useEffect(() => {
    if (state.success) onClose();
  }, [state, onClose]);

  return (
    <form action={formAction} className="space-y-6 rounded-lg border border-neutral-200 bg-white p-5">
      <FieldEvalFields />

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <SubmitButton />
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-neutral-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function FieldEvaluationForm({ traineeId }: { traineeId: string }) {
  const [open, setOpen] = useState(false);

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

  return <CreateEvalForm traineeId={traineeId} onClose={() => setOpen(false)} />;
}
