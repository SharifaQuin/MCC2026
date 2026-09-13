"use client";

import { useTransition } from "react";
import { toggleChecklistTaskStatusAction } from "@/app/actions/financials";
import type { ChecklistTaskStatus } from "@prisma/client";

export interface ChecklistItem {
  id: string;
  frequency: string;
  task: string;
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

function Row({ item }: { item: ChecklistItem }) {
  const [pending, startTransition] = useTransition();

  function advance() {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(item.effectiveStatus) + 1) % STATUS_CYCLE.length];
    startTransition(() => {
      toggleChecklistTaskStatusAction(item.id, next);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-neutral-800">{item.task}</p>
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          {item.frequency.replace("_", "-")}
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={advance}
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium disabled:opacity-60 ${STATUS_STYLES[item.effectiveStatus]}`}
      >
        {STATUS_LABELS[item.effectiveStatus]}
      </button>
    </div>
  );
}

export default function ChecklistToggleList({ items }: { items: ChecklistItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-neutral-400">No checklist items yet.</p>;
  }
  return <div className="divide-y divide-neutral-100">{items.map((i) => <Row key={i.id} item={i} />)}</div>;
}
