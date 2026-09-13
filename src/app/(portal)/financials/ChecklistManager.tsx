"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  addChecklistTaskAction,
  deleteChecklistTaskAction,
  toggleChecklistTaskStatusAction,
} from "@/app/actions/financials";
import type { ChecklistTaskStatus } from "@prisma/client";

export interface ChecklistRow {
  id: string;
  frequency: string;
  task: string;
  owner: string;
  visibility: string;
  effectiveStatus: ChecklistTaskStatus;
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

  function advance() {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(task.effectiveStatus) + 1) % STATUS_CYCLE.length];
    startTransition(() => {
      toggleChecklistTaskStatusAction(task.id, next);
    });
  }

  function remove() {
    if (!confirm(`Delete "${task.task}"?`)) return;
    startTransition(() => {
      deleteChecklistTaskAction(task.id);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 p-3">
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

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
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

      <div className="space-y-2">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </div>
    </div>
  );
}
