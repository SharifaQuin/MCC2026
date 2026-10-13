"use client";

import { useState, useTransition } from "react";
import {
  toggleChecklistTaskStatusAction,
  updateChecklistTaskNotesAction,
  updateChecklistTaskTargetDateAction,
} from "@/app/actions/financials";
import type { ChecklistTaskStatus } from "@prisma/client";

export interface AssignedChecklistRow {
  id: string;
  task: string;
  effectiveStatus: ChecklistTaskStatus;
  notes: string | null;
  targetDate: string | null;
  dueFridayOfWeek: boolean;
  frequency: string;
}

const STATUS_CYCLE: ChecklistTaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DONE"];
const STATUS_STYLES: Record<ChecklistTaskStatus, string> = {
  NOT_STARTED: "bg-neutral-100 text-neutral-600",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  DONE: "bg-green-100 text-green-800",
};
const STATUS_LABELS: Record<ChecklistTaskStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

// A deliberately narrow checklist view for any non-admin viewer (Trainee,
// Trainer, Service Manager, Office Assistant) — no delete, no category
// change, no bulk-add, no reassignment. Status/notes/date edits are still
// re-checked server-side (requireChecklistTaskEditAccess in
// src/app/actions/financials.ts) against the same TEAM-or-assigned scope
// this page already queried, so hiding these controls is UX only, not the
// actual security boundary.
function TaskRow({ task, canEdit }: { task: AssignedChecklistRow; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState(task.notes ?? "");
  const [dateDraft, setDateDraft] = useState(task.targetDate ? task.targetDate.slice(0, 10) : "");

  function advance(e: React.MouseEvent) {
    e.stopPropagation();
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(task.effectiveStatus) + 1) % STATUS_CYCLE.length];
    startTransition(() => {
      toggleChecklistTaskStatusAction(task.id, next);
    });
  }

  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((s) => !s)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setExpanded((s) => !s);
        }}
        className="flex cursor-pointer items-center justify-between gap-3"
      >
        <p className="min-w-0 truncate text-sm font-medium text-neutral-900">{task.task}</p>
        <button
          type="button"
          disabled={pending || !canEdit}
          onClick={advance}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium disabled:opacity-60 ${STATUS_STYLES[task.effectiveStatus]}`}
        >
          {STATUS_LABELS[task.effectiveStatus]}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
          <p className="text-sm font-medium text-neutral-900">{task.task}</p>

          {task.dueFridayOfWeek ? (
            <p className="text-xs text-neutral-500">Due date: automatically this week&apos;s Friday.</p>
          ) : task.frequency === "MONTHLY" ? (
            <p className="text-xs text-neutral-500">Due date: automatically the last day of the month.</p>
          ) : task.frequency === "DAILY" || task.frequency === "WEEKLY" ? (
            <p className="text-xs text-neutral-500">
              {task.frequency === "DAILY" ? "Daily" : "Weekly"} tasks don&apos;t use a due date.
            </p>
          ) : (
            <div onClick={(e) => e.stopPropagation()}>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Due date</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateDraft}
                  disabled={!canEdit}
                  onChange={(e) => setDateDraft(e.target.value)}
                  className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs disabled:opacity-60"
                />
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => startTransition(() => updateChecklistTaskTargetDateAction(task.id, dateDraft || null))}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                  >
                    Save
                  </button>
                )}
              </div>
            </div>
          )}

          <div onClick={(e) => e.stopPropagation()}>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Follow-up notes</label>
            <textarea
              value={notesDraft}
              disabled={!canEdit}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs disabled:opacity-60"
            />
            {canEdit && (
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => updateChecklistTaskNotesAction(task.id, notesDraft))}
                className="mt-2 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
              >
                Save notes
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssignedChecklist({
  tasks,
  canEdit,
}: {
  tasks: AssignedChecklistRow[];
  canEdit: boolean;
}) {
  if (tasks.length === 0) {
    return <p className="text-sm text-neutral-400">Nothing assigned or shared with you right now.</p>;
  }

  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} canEdit={canEdit} />
      ))}
    </div>
  );
}
