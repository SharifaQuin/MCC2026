"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  upsertMilestoneReviewAction,
  resetMilestoneReviewAction,
  MilestoneReviewState,
} from "@/app/actions/milestones";
import type { MilestoneCheckpoint } from "@prisma/client";
import type { MilestoneStatus } from "@/lib/milestones";

export interface MilestoneTimelineEntryView {
  checkpoint: MilestoneCheckpoint;
  label: string;
  dueDate: string;
  status: MilestoneStatus;
  review: { id: string; completedAt: string | null; score: number | null; notes: string | null } | null;
}

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  DUE_SOON: "bg-amber-100 text-amber-700",
  NOT_YET_DUE: "bg-neutral-100 text-neutral-500",
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
  DUE_SOON: "Due Soon",
  NOT_YET_DUE: "Not Yet Due",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

function MilestoneForm({
  employeeId,
  entry,
  onClose,
}: {
  employeeId: string;
  entry: MilestoneTimelineEntryView;
  onClose: () => void;
}) {
  const action = upsertMilestoneReviewAction.bind(null, employeeId, entry.checkpoint);
  const [state, formAction] = useFormState<MilestoneReviewState, FormData>(action, {});
  const [pending, startTransition] = useTransition();

  if (state.success) onClose();

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="completed" defaultChecked={!!entry.review?.completedAt} />
        Completed
      </label>
      <div>
        <label className="mb-1 block text-xs font-medium">Score (0–100, optional)</label>
        <input
          type="number"
          name="score"
          min={0}
          max={100}
          defaultValue={entry.review?.score ?? ""}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Notes</label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={entry.review?.notes ?? ""}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton />
        <button type="button" onClick={onClose} className="text-xs font-medium text-neutral-500 hover:underline">
          Cancel
        </button>
        {entry.review && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Reset this review back to not started?")) {
                startTransition(() => resetMilestoneReviewAction(entry.review!.id, employeeId));
                onClose();
              }
            }}
            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
          >
            Reset
          </button>
        )}
      </div>
    </form>
  );
}

function MilestoneRow({ employeeId, entry }: { employeeId: string; entry: MilestoneTimelineEntryView }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-900">{entry.label}</p>
          <p className="text-xs text-neutral-500">Due {new Date(entry.dueDate).toLocaleDateString()}</p>
          {entry.review?.score != null && (
            <p className="text-xs text-neutral-500">Score: {entry.review.score}/100</p>
          )}
          {entry.review?.notes && <p className="mt-1 text-xs text-neutral-600">{entry.review.notes}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[entry.status]}`}>
            {STATUS_LABELS[entry.status]}
          </span>
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              {entry.review ? "Edit" : "Start"}
            </button>
          )}
        </div>
      </div>
      {open && <MilestoneForm employeeId={employeeId} entry={entry} onClose={() => setOpen(false)} />}
    </div>
  );
}

export default function MilestonePanel({
  employeeId,
  timeline,
}: {
  employeeId: string;
  timeline: MilestoneTimelineEntryView[];
}) {
  return (
    <div className="space-y-3">
      {timeline.map((entry) => (
        <MilestoneRow key={entry.checkpoint} employeeId={employeeId} entry={entry} />
      ))}
    </div>
  );
}
