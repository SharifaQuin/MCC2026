"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  markEmployeeDepartedAction,
  reinstateEmployeeAction,
  updateExitInfoAction,
  DepartureState,
} from "@/app/actions/roster";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

function RehireAndExitInterviewFields({
  defaultRehireEligible,
  defaultExitInterviewCompleted,
  defaultExitInterviewNotes,
}: {
  defaultRehireEligible: boolean | null;
  defaultExitInterviewCompleted: boolean;
  defaultExitInterviewNotes: string;
}) {
  return (
    <>
      <div>
        <label className="mb-1 block text-xs font-medium">Eligible for rehire?</label>
        <select
          name="rehireEligible"
          defaultValue={defaultRehireEligible === null ? "" : String(defaultRehireEligible)}
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">Not yet determined</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="exitInterviewCompleted"
          defaultChecked={defaultExitInterviewCompleted}
          className="h-4 w-4"
        />
        Exit interview completed
      </label>
      <div>
        <label className="mb-1 block text-xs font-medium">Exit interview notes</label>
        <textarea
          name="exitInterviewNotes"
          rows={3}
          defaultValue={defaultExitInterviewNotes}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
    </>
  );
}

function ExitInfoEditForm({
  employeeId,
  rehireEligible,
  exitInterviewCompletedAt,
  exitInterviewNotes,
  onClose,
}: {
  employeeId: string;
  rehireEligible: boolean | null;
  exitInterviewCompletedAt: string | null;
  exitInterviewNotes: string | null;
  onClose: () => void;
}) {
  const action = updateExitInfoAction.bind(null, employeeId);
  const [state, formAction] = useFormState<DepartureState, FormData>(action, {});

  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  return (
    <form action={formAction} className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
      <RehireAndExitInterviewFields
        defaultRehireEligible={rehireEligible}
        defaultExitInterviewCompleted={!!exitInterviewCompletedAt}
        defaultExitInterviewNotes={exitInterviewNotes ?? ""}
      />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton label="Save" />
        <button type="button" onClick={onClose} className="text-sm font-medium text-neutral-500 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function DeparturePanel({
  employeeId,
  lastDay,
  departureReason,
  departureRecordedByName,
  rehireEligible,
  exitInterviewCompletedAt,
  exitInterviewNotes,
  canManage,
}: {
  employeeId: string;
  lastDay: string | null;
  departureReason: string | null;
  departureRecordedByName: string | null;
  rehireEligible: boolean | null;
  exitInterviewCompletedAt: string | null;
  exitInterviewNotes: string | null;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editingExitInfo, setEditingExitInfo] = useState(false);
  const [pending, startTransition] = useTransition();
  const action = markEmployeeDepartedAction.bind(null, employeeId);
  const [state, formAction] = useFormState<DepartureState, FormData>(action, {});

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  if (lastDay) {
    const rehireBadge =
      rehireEligible === true
        ? { label: "Rehire Eligible", style: "bg-green-100 text-green-700" }
        : rehireEligible === false
          ? { label: "Not Eligible for Rehire", style: "bg-red-100 text-red-700" }
          : { label: "Rehire Eligibility Undetermined", style: "bg-neutral-100 text-neutral-600" };

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

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${rehireBadge.style}`}>
            {rehireBadge.label}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              exitInterviewCompletedAt ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {exitInterviewCompletedAt
              ? `Exit Interview Completed ${new Date(exitInterviewCompletedAt).toLocaleDateString()}`
              : "Exit Interview Not Completed"}
          </span>
        </div>
        {exitInterviewNotes && <p className="mt-2 text-sm text-neutral-600">{exitInterviewNotes}</p>}

        {canManage && !editingExitInfo && (
          <button
            type="button"
            onClick={() => setEditingExitInfo(true)}
            className="mt-2 text-xs font-medium text-brand-700 hover:underline"
          >
            Edit Rehire / Exit Interview Info
          </button>
        )}
        {editingExitInfo && (
          <ExitInfoEditForm
            employeeId={employeeId}
            rehireEligible={rehireEligible}
            exitInterviewCompletedAt={exitInterviewCompletedAt}
            exitInterviewNotes={exitInterviewNotes}
            onClose={() => setEditingExitInfo(false)}
          />
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
          <RehireAndExitInterviewFields
            defaultRehireEligible={null}
            defaultExitInterviewCompleted={false}
            defaultExitInterviewNotes=""
          />
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex items-center gap-3">
            <SubmitButton label="Mark Departed" />
            <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-neutral-500 hover:underline">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
