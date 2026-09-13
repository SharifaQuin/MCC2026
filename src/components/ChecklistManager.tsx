"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  addChecklistTaskAction,
  bulkAddChecklistTasksAction,
  deleteChecklistTaskAction,
  setChecklistTaskCategoryAction,
  toggleChecklistTaskStatusAction,
  updateChecklistTaskNotesAction,
  updateChecklistTaskTargetDateAction,
} from "@/app/actions/financials";
import {
  splitChecklistTasks,
  groupByCategory,
  guessChecklistCategory,
  getDueStatus,
  CATEGORY_LABELS,
} from "@/lib/checklistDisplay";
import type { ChecklistCategory, ChecklistFrequency, ChecklistTaskStatus, ChecklistVisibility } from "@prisma/client";

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

const DUE_BADGE_STYLES: Record<"OVERDUE" | "DUE_SOON", string> = {
  OVERDUE: "bg-red-100 text-red-700",
  DUE_SOON: "bg-amber-100 text-amber-800",
};
const DUE_BADGE_LABELS: Record<"OVERDUE" | "DUE_SOON", string> = {
  OVERDUE: "Overdue",
  DUE_SOON: "Due soon",
};

function TaskRow({ task }: { task: ChecklistRow }) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState(task.notes ?? "");
  const [dateDraft, setDateDraft] = useState(task.targetDate ? task.targetDate.slice(0, 10) : "");
  const dueStatus = getDueStatus(task);

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

  function saveDate() {
    startTransition(() => {
      updateChecklistTaskTargetDateAction(task.id, dateDraft || null);
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
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-neutral-900">{task.task}</p>
            {dueStatus && (
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${DUE_BADGE_STYLES[dueStatus]}`}>
                {DUE_BADGE_LABELS[dueStatus]}
              </span>
            )}
          </div>
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

          {task.frequency === "MONTHLY" ? (
            <p className="text-xs text-neutral-500">
              Due date: automatically the last day of the month — no need to set one.
            </p>
          ) : task.frequency === "DAILY" || task.frequency === "WEEKLY" ? (
            <p className="text-xs text-neutral-500">
              {task.frequency === "DAILY" ? "Daily" : "Weekly"} tasks don't use a due date — resetting each period is
              their deadline.
            </p>
          ) : (
            <div onClick={(e) => e.stopPropagation()}>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Due date</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateDraft}
                  onChange={(e) => setDateDraft(e.target.value)}
                  className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={pending || dateDraft === (task.targetDate ? task.targetDate.slice(0, 10) : "")}
                  onClick={saveDate}
                  className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40"
                >
                  {pending ? "Saving..." : "Save"}
                </button>
                {dateDraft && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setDateDraft("")}
                    className="text-xs text-neutral-500 hover:underline disabled:opacity-40"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
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

interface BulkItem {
  task: string;
  category: ChecklistCategory;
}

// Paste a list of tasks, one per line -> each gets a guessed category from
// its text (keyword match, not real AI) -> review/correct any guess before
// creating them all at once. Frequency and visibility apply to the whole
// batch rather than being guessed per line.
function BulkAddPanel({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [frequency, setFrequency] = useState("ONE_TIME");
  const [visibility, setVisibility] = useState<ChecklistVisibility>("OWNER_ONLY");
  const [preview, setPreview] = useState<BulkItem[] | null>(null);

  function buildPreview() {
    const items = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((task) => ({ task, category: guessChecklistCategory(task) }));
    setPreview(items);
  }

  function updateCategory(index: number, category: ChecklistCategory) {
    setPreview((p) => p && p.map((item, i) => (i === index ? { ...item, category } : item)));
  }

  function confirm() {
    if (!preview || preview.length === 0) return;
    startTransition(async () => {
      await bulkAddChecklistTasksAction(preview, frequency, visibility);
      onDone();
    });
  }

  if (preview) {
    return (
      <div className="mb-4 rounded-md border border-neutral-200 p-4">
        <p className="mb-3 text-xs text-neutral-500">
          {preview.length} task{preview.length === 1 ? "" : "s"} — check the guessed categories, fix any that are
          wrong, then add them.
        </p>
        <div className="mb-4 space-y-2">
          {preview.map((item, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-neutral-50 p-2">
              <p className="min-w-0 flex-1 truncate text-xs text-neutral-800">{item.task}</p>
              <select
                value={item.category}
                onChange={(e) => updateCategory(i, e.target.value as ChecklistCategory)}
                className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-xs"
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={confirm}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Adding..." : `Add ${preview.length} task${preview.length === 1 ? "" : "s"}`}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setPreview(null)}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-3 rounded-md border border-neutral-200 p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">
          Tasks (one per line)
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={"Renew business insurance\nFollow up with 3 pending quotes\nSchedule Q4 team review"}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Frequency (all tasks)</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="ONE_TIME">One-Time</option>
            <option value="MILESTONE">Milestone</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Visible to (all tasks)</label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as ChecklistVisibility)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="OWNER_ONLY">Owner only</option>
            <option value="TEAM">Team</option>
          </select>
        </div>
      </div>
      <button
        type="button"
        onClick={buildPreview}
        disabled={!text.trim()}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
      >
        Preview categories
      </button>
    </div>
  );
}

export default function ChecklistManager({ tasks }: { tasks: ChecklistRow[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
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
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setShowAdd((s) => !s);
              setShowBulkAdd(false);
            }}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            {showAdd ? "Cancel" : "+ Add a task"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowBulkAdd((s) => !s);
              setShowAdd(false);
            }}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            {showBulkAdd ? "Cancel" : "+ Bulk add"}
          </button>
        </div>
      </div>

      {showBulkAdd && <BulkAddPanel onDone={() => setShowBulkAdd(false)} />}

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
            <p className="mt-1 text-[11px] text-neutral-400">
              One-Time/Milestone only — defaults to 3 days out if left blank. Monthly is always due month-end;
              Daily/Weekly don&apos;t use a due date.
            </p>
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
