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
    <div className="flex items-center gap-2 text-sm">
      <label className="text-neutral-500">Assigned to</label>
      <select
        defaultValue={assignedToId ?? ""}
        disabled={pending}
        onChange={(e) => startTransition(() => setLeadAssignmentAction(leadId, e.target.value))}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-60"
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
