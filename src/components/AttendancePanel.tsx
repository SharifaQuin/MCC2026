"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createAttendanceEventAction,
  deleteAttendanceEventAction,
  AttendanceEventState,
} from "@/app/actions/attendance";

export interface AttendanceEventRow {
  id: string;
  kind: "TARDY" | "ABSENCE" | "NO_CALL_NO_SHOW";
  reasonCategory: "ILLNESS" | "EMERGENCY" | "FAMILY_EMERGENCY" | "TRANSPORTATION" | "OTHER" | null;
  eventDate: string;
  notes: string | null;
  loggedByName: string;
}

const KIND_LABELS: Record<AttendanceEventRow["kind"], string> = {
  TARDY: "Tardy",
  ABSENCE: "Absence",
  NO_CALL_NO_SHOW: "No-Call, No-Show",
};

const KIND_STYLES: Record<AttendanceEventRow["kind"], string> = {
  TARDY: "bg-amber-100 text-amber-700",
  ABSENCE: "bg-orange-100 text-orange-700",
  NO_CALL_NO_SHOW: "bg-red-100 text-red-700",
};

const REASON_LABELS: Record<NonNullable<AttendanceEventRow["reasonCategory"]>, string> = {
  ILLNESS: "Illness",
  EMERGENCY: "Emergency",
  FAMILY_EMERGENCY: "Family Emergency",
  TRANSPORTATION: "Transportation Issue",
  OTHER: "Other",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Log Event"}
    </button>
  );
}

function LogEventForm({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const action = createAttendanceEventAction.bind(null, employeeId);
  const [state, formAction] = useFormState<AttendanceEventState, FormData>(action, {});
  const [kind, setKind] = useState<AttendanceEventRow["kind"]>("TARDY");

  if (state.success) onClose();

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Event type</label>
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AttendanceEventRow["kind"])}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="TARDY">Tardy</option>
            <option value="ABSENCE">Absence</option>
            <option value="NO_CALL_NO_SHOW">No-Call, No-Show</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Date</label>
          <input
            type="date"
            name="eventDate"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      {kind === "ABSENCE" && (
        <div>
          <label className="mb-1 block text-xs font-medium">Reason</label>
          <select
            name="reasonCategory"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Choose a reason...</option>
            <option value="ILLNESS">Illness</option>
            <option value="EMERGENCY">Emergency</option>
            <option value="FAMILY_EMERGENCY">Family Emergency</option>
            <option value="TRANSPORTATION">Transportation Issue</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium">Notes (optional)</label>
        <textarea
          name="notes"
          rows={2}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton />
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

export default function AttendancePanel({
  employeeId,
  events,
}: {
  employeeId: string;
  events: AttendanceEventRow[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const tardyCount = events.filter((e) => e.kind === "TARDY").length;
  const absenceCount = events.filter((e) => e.kind === "ABSENCE").length;
  const noCallCount = events.filter((e) => e.kind === "NO_CALL_NO_SHOW").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          {tardyCount} tardy{tardyCount === 1 ? "" : "s"} · {absenceCount} absence
          {absenceCount === 1 ? "" : "s"} · {noCallCount} no-call/no-show
          {noCallCount === 1 ? "" : "s"}
        </p>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Log Attendance Event
          </button>
        )}
      </div>

      {open && <LogEventForm employeeId={employeeId} onClose={() => setOpen(false)} />}

      {events.length === 0 ? (
        <p className="text-sm text-neutral-500">No attendance events logged.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Reason</th>
                <th className="px-4 py-2">Notes</th>
                <th className="px-4 py-2">Logged by</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2">{new Date(e.eventDate).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_STYLES[e.kind]}`}
                    >
                      {KIND_LABELS[e.kind]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    {e.reasonCategory ? REASON_LABELS[e.reasonCategory] : "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{e.notes ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-500">{e.loggedByName}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (confirm("Delete this attendance event?")) {
                          startTransition(() => deleteAttendanceEventAction(e.id, employeeId));
                        }
                      }}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
