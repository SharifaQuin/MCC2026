"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  addChecklistTaskAction,
  deleteChecklistTaskAction,
  setChecklistTaskCategoryAction,
  toggleChecklistTaskStatusAction,
  updateChecklistTaskNotesAction,
} from "@/app/actions/financials";
import { splitChecklistTasks, groupByCategory } from "@/lib/checklistDisplay";
import type { ChecklistCategory, ChecklistFrequency, ChecklistTaskStatus } from "@prisma/client";

export interface ChecklistRow {
  id: string;
  frequency: ChecklistFrequency;
  task: string;
  owner: string;
  visibility: string;
  effectiveStatus: ChecklistTaskStatus;
  category: ChecklistCategory;
  notes: string | null;
  targetDate: string | null;
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

function TaskRow({ task }: { task: ChecklistRow }) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState(task.notes ?? "");

  function advance(e: React.MouseEvent) {
    e.stopPropagation();
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(task.effectiveStatus) + 1) % STATUS_CYCLE.length];
    startTransition(() => {
      toggleChecklistTaskStatusAction(task.id, next);
    });
  }

  function remove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${task.task}"?`)) return;
    startTransition(() => {
      deleteChecklistTaskAction(task.id);
    });
  }

  function saveNotes() {
    startTransition(() => {
      updateChecklistTaskNotesAction(task.id, notesDraft);
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
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-900">{task.task}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {task.frequency.replace("_", "-")} · {task.owner === "TEAM" ? "Team" : "Owner"} ·{" "}
            {task.visibility === "TEAM" ? "Visible to team" : "Owner only"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={advance}
            className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-60 ${STATUS_STYLES[task.effectiveStatus]}`}
          >
            {STATUS_LABELS[task.effectiveStatus]}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="text-xs text-red-600 hover:underline disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Category</label>
            <select
              defaultValue={task.category}
              disabled={pending}
              onChange={(e) => {
                startTransition(() => {
                  setChecklistTaskCategoryAction(task.id, e.target.value as ChecklistCategory);
                });
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
            >
              <option value="MARKETING">Marketing</option>
              <option value="SALES">Sales</option>
              <option value="HR">HR</option>
              <option value="MANAGEMENT">Management/Admin</option>
            </select>
          </div>

          {task.targetDate && (
            <p className="text-xs text-neutral-500">
              Target date: {new Date(task.targetDate).toLocaleDateString()}
            </p>
          )}

          <div onClick={(e) => e.stopPropagation()}>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Notes</label>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={2}
              placeholder="Add any notes about this task..."
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              disabled={pending || notesDraft === (task.notes ?? "")}
              onClick={saveNotes}
              className="mt-1 rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40"
            >
              {pending ? "Saving..." : "Save notes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Adding..." : "Add task"}
    </button>
  );
}

export default function ChecklistManager({ tasks }: { tasks: ChecklistRow[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { active, archived } = splitChecklistTasks(tasks);
  const activeGroups = groupByCategory(active);
  const archivedGroups = groupByCategory(archived);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          {active.length} active task{active.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => setShowAdd((s) => !s)}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          {showAdd ? "Cancel" : "+ Add a task"}
        </button>
      </div>

      {showAdd && (
        <form
          action={addChecklistTaskAction}
          className="mb-4 grid grid-cols-2 gap-3 rounded-md border border-neutral-200 p-4 md:grid-cols-4"
        >
          <div className="col-span-2 md:col-span-4">
            <label className="mb-1 block text-xs font-medium text-neutral-600">Task</label>
            <input name="task" required className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Frequency</label>
            <select name="frequency" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="ONE_TIME">One-Time</option>
              <option value="MILESTONE">Milestone</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Category</label>
            <select name="category" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="MARKETING">Marketing</option>
              <option value="SALES">Sales</option>
              <option value="HR">HR</option>
              <option value="MANAGEMENT">Management/Admin</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Owner</label>
            <select name="owner" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="OWNER">Owner</option>
              <option value="TEAM">Team</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Visible to</label>
            <select name="visibility" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="OWNER_ONLY">Owner only</option>
              <option value="TEAM">Team</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Target date (optional)</label>
            <input type="date" name="targetDate" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2 md:col-span-4">
            <AddSubmitButton />
          </div>
        </form>
      )}

      {active.length === 0 ? (
        <p className="text-sm text-neutral-400">Nothing active right now.</p>
      ) : (
        <div className="space-y-4">
          {activeGroups.map((group) => (
            <div key={group.category}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {group.label}
              </p>
              <div className="space-y-2">
                {group.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            className="text-xs font-medium text-neutral-500 hover:text-neutral-700"
          >
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-2 space-y-4 opacity-70">
              {archivedGroups.map((group) => (
                <div key={group.category}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    {group.label}
                  </p>
                  <div className="space-y-2">
                    {group.tasks.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
