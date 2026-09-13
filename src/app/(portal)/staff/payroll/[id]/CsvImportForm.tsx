"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { importPayrollCsvAction, CsvImportState } from "@/app/actions/payroll";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Importing..." : "Import CSV"}
    </button>
  );
}

export default function CsvImportForm({ payPeriodId }: { payPeriodId: string }) {
  const [open, setOpen] = useState(false);
  const action = importPayrollCsvAction.bind(null, payPeriodId);
  const [state, formAction] = useFormState<CsvImportState, FormData>(action, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Import Hours from CSV
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium">CSV file</label>
        <input
          type="file"
          name="csvFile"
          accept=".csv,text/csv"
          required
          className="block w-full text-sm"
        />
        <p className="mt-1 text-xs text-neutral-400">
          Columns: email, regularHours, overtimeHours (overtime optional). An optional header row
          starting with &quot;email&quot; is fine. Re-importing an employee&apos;s row overwrites
          their hours and re-opens the entry for their review.
        </p>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.imported !== undefined && (
        <p className="text-sm text-green-700">Imported {state.imported} row(s).</p>
      )}
      {state?.errors && state.errors.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-red-600">
          {state.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-medium text-neutral-500 hover:underline"
        >
          Close
        </button>
      </div>
    </form>
  );
}
