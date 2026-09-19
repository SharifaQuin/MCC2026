"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  assignTrainerAction,
  endTrainingAssignmentAction,
  type TrainingAssignmentState,
} from "@/app/actions/trainingAssignments";
import type { TrainingAssignmentHistoryRow } from "@/lib/trainingAssignment";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

function AssignForm({
  traineeId,
  candidates,
  onClose,
}: {
  traineeId: string;
  candidates: { id: string; name: string }[];
  onClose: () => void;
}) {
  const action = assignTrainerAction.bind(null, traineeId);
  const [state, formAction] = useFormState<TrainingAssignmentState, FormData>(action, {});

  if (state.success) onClose();

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium">Trainer</label>
        <select name="trainerId" required className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="">Choose a trainer...</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Start date</label>
        <input
          type="date"
          name="startDate"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
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

export default function TrainingAssignmentPanel({
  traineeId,
  current,
  history,
  candidates,
}: {
  traineeId: string;
  current: { assignmentId: string; trainerId: string; trainerName: string; startDate: string } | null;
  history: TrainingAssignmentHistoryRow[];
  candidates: { id: string; name: string }[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {current ? (
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
          <div>
            <p className="text-sm font-medium text-neutral-900">
              Assigned Trainer — <span className="font-semibold">{current.trainerName}</span>
            </p>
            <p className="text-xs text-neutral-500">Since {new Date(current.startDate).toLocaleDateString()}</p>
          </div>
          <div className="flex gap-3">
            {!formOpen && (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Change
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("End this training assignment?")) {
                  startTransition(() =>
                    endTrainingAssignmentAction(current.assignmentId, traineeId, current.trainerId)
                  );
                }
              }}
              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
            >
              End Assignment
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-neutral-300 p-4">
          <p className="text-sm text-neutral-500">No trainer assigned.</p>
          {!formOpen && (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              + Assign Trainer
            </button>
          )}
        </div>
      )}

      {formOpen && (
        <AssignForm traineeId={traineeId} candidates={candidates} onClose={() => setFormOpen(false)} />
      )}

      {history.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="text-xs font-medium text-neutral-500 hover:underline"
          >
            {showHistory ? "Hide" : "Show"} assignment history ({history.length})
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-md bg-neutral-50 px-3 py-2 text-xs">
                  <span>
                    Trainer <strong>{h.trainerName}</strong>
                  </span>
                  <span className="text-neutral-500">
                    {new Date(h.startDate).toLocaleDateString()} –{" "}
                    {h.endDate ? new Date(h.endDate).toLocaleDateString() : "present"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
