"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createComplaintAction,
  setComplaintStatusAction,
  deleteComplaintAction,
  ComplaintState,
} from "@/app/actions/complaints";

export interface ComplaintRow {
  id: string;
  clientName: string;
  incidentDate: string | null;
  description: string;
  status: "OPEN" | "VALID" | "DISMISSED";
  resolutionNotes: string | null;
  loggedByName: string;
  createdAt: string;
}

const STATUS_STYLES: Record<ComplaintRow["status"], string> = {
  OPEN: "bg-amber-100 text-amber-700",
  VALID: "bg-red-100 text-red-700",
  DISMISSED: "bg-neutral-100 text-neutral-500",
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

function LogComplaintForm({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const action = createComplaintAction.bind(null, employeeId);
  const [state, formAction] = useFormState<ComplaintState, FormData>(action, {});

  if (state.success) onClose();

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Client name</label>
          <input
            name="clientName"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Incident date</label>
          <input
            type="date"
            name="incidentDate"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Description</label>
        <textarea
          name="description"
          required
          rows={3}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton label="Log Complaint" />
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-neutral-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ComplaintItem({ employeeId, complaint }: { employeeId: string; complaint: ComplaintRow }) {
  const [pending, startTransition] = useTransition();
  const [resolutionNotes, setResolutionNotes] = useState(complaint.resolutionNotes ?? "");
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-neutral-900">{complaint.clientName}</p>
          <p className="text-xs text-neutral-500">
            {complaint.incidentDate
              ? new Date(complaint.incidentDate).toLocaleDateString()
              : new Date(complaint.createdAt).toLocaleDateString()}{" "}
            · logged by {complaint.loggedByName}
          </p>
          <p className="mt-2 text-sm text-neutral-700">{complaint.description}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[complaint.status]}`}
        >
          {complaint.status}
        </span>
      </div>

      {complaint.resolutionNotes && !expanded && (
        <p className="mt-2 text-xs text-neutral-500">Note: {complaint.resolutionNotes}</p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          {expanded ? "Hide" : "Review"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm("Delete this complaint record?")) {
              startTransition(() => deleteComplaintAction(complaint.id, employeeId));
            }
          }}
          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
        >
          Delete
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
          <textarea
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            placeholder="Resolution notes (optional)"
            rows={2}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() =>
                  setComplaintStatusAction(complaint.id, employeeId, "VALID", resolutionNotes)
                )
              }
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              Mark Valid
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() =>
                  setComplaintStatusAction(complaint.id, employeeId, "DISMISSED", resolutionNotes)
                )
              }
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
            >
              Dismiss
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() =>
                  setComplaintStatusAction(complaint.id, employeeId, "OPEN", resolutionNotes)
                )
              }
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
            >
              Reopen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ComplaintsPanel({
  employeeId,
  complaints,
  validCount,
}: {
  employeeId: string;
  complaints: ComplaintRow[];
  validCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          {validCount} valid complaint{validCount === 1 ? "" : "s"} in the last 60 days
          {validCount >= 3 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {validCount >= 4 ? "At termination threshold" : "Approaching threshold"}
            </span>
          )}
        </p>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Log Complaint
          </button>
        )}
      </div>

      {open && <LogComplaintForm employeeId={employeeId} onClose={() => setOpen(false)} />}

      {complaints.length === 0 ? (
        <p className="text-sm text-neutral-500">No complaints logged.</p>
      ) : (
        <div className="space-y-3">
          {complaints.map((c) => (
            <ComplaintItem key={c.id} employeeId={employeeId} complaint={c} />
          ))}
        </div>
      )}
    </div>
  );
}
