"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { addChecklistTaskAction, toggleChecklistTaskStatusAction } from "@/app/actions/financials";
import { splitChecklistTasks, groupByCategory, getDueStatus, getEffectiveTargetDate } from "@/lib/checklistDisplay";
import type { ChecklistCategory, ChecklistFrequency, ChecklistTaskStatus } from "@prisma/client";

export interface ChecklistItem {
  id: string;
  frequency: ChecklistFrequency;
  task: string;
  effectiveStatus: ChecklistTaskStatus;
  category: ChecklistCategory;
  notes: string | null;
  targetDate: string | null;
  dueFridayOfWeek: boolean;
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

function Row({ item }: { item: ChecklistItem }) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const dueStatus = getDueStatus(item);

  function advance(e: React.MouseEvent) {
    e.stopPropagation();
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(item.effectiveStatus) + 1) % STATUS_CYCLE.length];
    startTransition(() => {
      toggleChecklistTaskStatusAction(item.id, next);
    });
  }

  return (
    <div className="py-1.5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((s) => !s)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setExpanded((s) => !s);
        }}
        className="flex w-full cursor-pointer items-start justify-between gap-2 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm text-neutral-800">{item.task}</p>
            {dueStatus && (
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${DUE_BADGE_STYLES[dueStatus]}`}>
                {DUE_BADGE_LABELS[dueStatus]}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            {item.frequency.replace("_", "-")}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={advance}
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium disabled:opacity-60 ${STATUS_STYLES[item.effectiveStatus]}`}
        >
          {STATUS_LABELS[item.effectiveStatus]}
        </button>
      </div>
      {expanded && (
        <div className="mt-1 rounded-md bg-neutral-50 px-2 py-1.5 text-xs text-neutral-500">
          {item.notes ? <p>{item.notes}</p> : <p className="italic text-neutral-400">No notes yet.</p>}
          {(() => {
            const due = getEffectiveTargetDate(item);
            return due ? <p className="mt-1 text-neutral-400">Target: {due.toLocaleDateString()}</p> : null;
          })()}
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
      className="w-full rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Adding..." : "Add task"}
    </button>
  );
}

// Bundles OWNER + OWNER_ONLY, or TEAM + TEAM, so the quick-add form here only
// needs one choice; the full add form on /financials still sets them independently.
function QuickAddForm() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 border-b border-neutral-100 pb-3">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="text-xs font-medium text-brand-700 hover:underline"
      >
        {open ? "Cancel" : "+ Add a task"}
      </button>
      {open && (
        <form action={addChecklistTaskAction} className="mt-2 space-y-2">
          <input
            name="task"
            required
            placeholder="Task"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
          />
          <div className="flex gap-2">
            <select
              name="frequency"
              defaultValue="ONE_TIME"
              className="w-1/2 rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="ONE_TIME">One-Time</option>
              <option value="MILESTONE">Milestone</option>
            </select>
            <select
              name="category"
              defaultValue="MANAGEMENT"
              className="w-1/2 rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
            >
              <option value="MARKETING">Marketing</option>
              <option value="SALES">Sales</option>
              <option value="HR">HR</option>
              <option value="MANAGEMENT">Management/Admin</option>
            </select>
          </div>
          <select
            name="visibility"
            defaultValue="OWNER_ONLY"
            onChange={(e) => {
              const form = e.currentTarget.form;
              const ownerInput = form?.querySelector<HTMLInputElement>('input[name="owner"]');
              if (ownerInput) ownerInput.value = e.currentTarget.value === "TEAM" ? "TEAM" : "OWNER";
            }}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
          >
            <option value="OWNER_ONLY">Owner only</option>
            <option value="TEAM">Visible to team</option>
          </select>
          <input type="hidden" name="owner" defaultValue="OWNER" />
          <AddSubmitButton />
        </form>
      )}
    </div>
  );
}

export default function ChecklistSidebar({ items, isAdmin }: { items: ChecklistItem[]; isAdmin: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const { active, archived } = splitChecklistTasks(items);
  const activeGroups = groupByCategory(active);
  const archivedGroups = groupByCategory(archived);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Checklist</h2>
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          className="text-xs text-neutral-400 hover:text-neutral-600"
        >
          {expanded ? "Hide" : "Show"}
        </button>
      </div>

      {expanded && (
        <>
          {isAdmin && <QuickAddForm />}

          {active.length === 0 ? (
            <p className="text-xs text-neutral-400">Nothing to do right now.</p>
          ) : (
            <div className="space-y-3">
              {activeGroups.map((group) => (
                <div key={group.category}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    {group.label}
                  </p>
                  <div className="divide-y divide-neutral-100">
                    {group.tasks.map((i) => (
                      <Row key={i.id} item={i} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {archived.length > 0 && (
            <div className="mt-3 border-t border-neutral-100 pt-2">
              <button
                type="button"
                onClick={() => setShowArchived((s) => !s)}
                className="text-xs text-neutral-400 hover:text-neutral-600"
              >
                {showArchived ? "Hide" : "Show"} archived ({archived.length})
              </button>
              {showArchived && (
                <div className="mt-2 space-y-3 opacity-60">
                  {archivedGroups.map((group) => (
                    <div key={group.category}>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        {group.label}
                      </p>
                      <div className="divide-y divide-neutral-100">
                        {group.tasks.map((i) => (
                          <Row key={i.id} item={i} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
