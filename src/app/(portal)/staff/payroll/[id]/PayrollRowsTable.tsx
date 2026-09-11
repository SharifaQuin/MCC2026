"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  upsertPayrollEntryAction,
  deletePayrollEntryAction,
  resolveDisputeAction,
  EntryFormState,
} from "@/app/actions/payroll";
import { fileToDataUrl } from "@/lib/fileToDataUrl";
import type { PayrollEmployeeRow } from "@/lib/payroll";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  DISPUTED: "bg-red-100 text-red-700",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save Hours"}
    </button>
  );
}

function EntryEditForm({
  payPeriodId,
  employeeId,
  entry,
  onClose,
}: {
  payPeriodId: string;
  employeeId: string;
  entry: PayrollEmployeeRow["entry"];
  onClose: () => void;
}) {
  const action = upsertPayrollEntryAction.bind(null, payPeriodId, employeeId);
  const [state, formAction] = useFormState<EntryFormState, FormData>(action, {});
  const [attachmentDataUrl, setAttachmentDataUrl] = useState(entry?.attachmentDataUrl ?? "");
  const [attachmentFileName, setAttachmentFileName] = useState(entry?.attachmentFileName ?? "");
  const [fileError, setFileError] = useState<string | null>(null);

  if (state.success) onClose();

  return (
    <form action={formAction} className="mt-2 space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Regular hours</label>
          <input
            type="number"
            step="0.01"
            min="0"
            name="regularHours"
            defaultValue={entry?.regularHours ?? ""}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Overtime hours</label>
          <input
            type="number"
            step="0.01"
            min="0"
            name="overtimeHours"
            defaultValue={entry?.overtimeHours ?? 0}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">
          Reference document (optional, e.g. a timesheet PDF)
        </label>
        <input type="hidden" name="attachmentDataUrl" value={attachmentDataUrl} />
        <input type="hidden" name="attachmentFileName" value={attachmentFileName} />
        {attachmentFileName && (
          <div className="mb-2 flex items-center gap-3">
            <a
              href={attachmentDataUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              View {attachmentFileName}
            </a>
            <button
              type="button"
              onClick={() => {
                setAttachmentDataUrl("");
                setAttachmentFileName("");
              }}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        )}
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setFileError(null);
            try {
              setAttachmentDataUrl(await fileToDataUrl(file));
              setAttachmentFileName(file.name);
            } catch {
              setFileError("Couldn't read that file — try again.");
            }
          }}
          className="block w-full text-sm"
        />
        {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
        <p className="mt-1 text-xs text-neutral-400">
          This is just attached for reference — it&apos;s shown to the employee, not parsed for
          hours.
        </p>
      </div>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton />
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-neutral-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DisputeResolution({
  payPeriodId,
  entryId,
}: {
  payPeriodId: string;
  entryId: string;
}) {
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-2 space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="What did you tell them / what changed? (optional)"
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-xs"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => resolveDisputeAction(entryId, payPeriodId, notes))}
        className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Saving..." : "Mark Resolved (sends back for employee review)"}
      </button>
    </div>
  );
}

function Row({ payPeriodId, row }: { payPeriodId: string; row: PayrollEmployeeRow }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const { entry } = row;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-neutral-900">{row.name}</p>
          <p className="text-xs text-neutral-500">{row.email}</p>
        </div>
        <div className="flex items-center gap-3">
          {entry ? (
            <span className="text-sm text-neutral-700">
              {entry.regularHours}h reg
              {entry.overtimeHours > 0 ? ` + ${entry.overtimeHours}h OT` : ""}
            </span>
          ) : (
            <span className="text-xs text-neutral-400">No hours entered</span>
          )}
          {entry && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[entry.status]}`}>
              {entry.status}
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            {editing ? "Close" : entry ? "Edit" : "Add Hours"}
          </button>
          {entry && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("Delete this payroll entry?")) {
                  startTransition(() => deletePayrollEntryAction(entry.id, payPeriodId));
                }
              }}
              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {entry?.signedAt && (
        <p className="mt-2 text-xs text-green-700">
          Approved by &ldquo;{entry.signedName}&rdquo; on {new Date(entry.signedAt).toLocaleString()}
        </p>
      )}

      {entry?.status === "DISPUTED" && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Employee question:</p>
          <p>{entry.disputeNote}</p>
        </div>
      )}
      {entry?.resolutionNotes && (
        <p className="mt-2 text-xs text-neutral-500">
          HR note: {entry.resolutionNotes}
          {entry.resolvedAt && ` (${new Date(entry.resolvedAt).toLocaleDateString()})`}
        </p>
      )}
      {entry?.status === "DISPUTED" && (
        <DisputeResolution payPeriodId={payPeriodId} entryId={entry.id} />
      )}

      {editing && (
        <EntryEditForm
          payPeriodId={payPeriodId}
          employeeId={row.employeeId}
          entry={entry}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

export default function PayrollRowsTable({
  payPeriodId,
  rows,
}: {
  payPeriodId: string;
  rows: PayrollEmployeeRow[];
}) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Row key={row.employeeId} payPeriodId={payPeriodId} row={row} />
      ))}
    </div>
  );
}
