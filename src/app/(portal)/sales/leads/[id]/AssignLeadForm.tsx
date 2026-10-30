"use client";

import { useTransition } from "react";
import { setLeadAssignmentAction } from "../actions";

export default function AssignLeadForm({
  leadId,
  assignedToId,
  teamMembers,
}: {
  leadId: string;
  assignedToId: string | null;
  teamMembers: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <label className="shrink-0 text-neutral-500">Assigned to</label>
      <select
        defaultValue={assignedToId ?? ""}
        disabled={pending}
        onChange={(e) => startTransition(() => setLeadAssignmentAction(leadId, e.target.value))}
        // Bounded so an unusually long team-member name can't force this
        // (or the page) to overflow horizontally on a narrow viewport — a
        // native <select>'s closed-box width otherwise follows its widest
        // <option> in several browsers, unconstrained by its container.
        className="max-w-[150px] min-w-0 rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-60"
      >
        <option value="">Unassigned</option>
        {teamMembers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
