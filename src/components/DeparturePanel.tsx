"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { markEmployeeDepartedAction, reinstateEmployeeAction, DepartureState } from "@/app/actions/roster";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Mark Departed"}
    </button>
  );
}

export default function DeparturePanel({
  employeeId,
  lastDay,
  departureReason,
  departureRecordedByName,
  canManage,
}: {
  employeeId: string;
  lastDay: string | null;
  departureReason: string | null;
  departureRecordedByName: string | null;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const action = markEmployeeDepartedAction.bind(null, employeeId);
  const [state, formAction] = useFormState<DepartureState, FormData>(action, {});

  if (state.success && open) setOpen(false);

  if (lastDay) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-medium">Roster Status</p>
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">Departed</span>
        </div>
        <p className="text-sm text-neutral-600">Last day: {new Date(lastDay).toLocaleDateString()}</p>
        {departureReason && <p className="mt-1 text-sm text-neutral-600">{departureReason}</p>}
        {departureRecordedByName && (
          <p className="mt-1 text-xs text-neutral-500">Recorded by {departureRecordedByName}</p>
        )}
        {canManage && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Reinstate this employee? This clears their departure record and reactivates their account.")) {
                startTransition(() => reinstateEmployeeAction(employeeId));
              }
            }}
            className="mt-3 rounded-md bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-60"
          >
            {pending ? "..." : "Reinstate"}
          </button>
        )}
      </div>
    );
  }

  if (!canManage) return null;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium">Roster Status</p>
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">Active</span>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          Mark Departed
        </button>
      ) : (
        <form action={formAction} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Last day</label>
            <input
              type="date"
              name="lastDay"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Reason</label>
            <textarea
              name="departureReason"
              rows={2}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex items-center gap-3">
            <SubmitButton />
            <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-neutral-500 hover:underline">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
