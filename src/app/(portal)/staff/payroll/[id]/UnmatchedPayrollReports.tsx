"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  attachUnmatchedPayrollReportAction,
  dismissUnmatchedPayrollReportAction,
  AttachUnmatchedState,
} from "@/app/actions/payroll";
import type { UnmatchedPayrollReportRow } from "@/lib/payroll";

function AttachButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Attaching..." : "Attach"}
    </button>
  );
}

function Row({
  payPeriodId,
  row,
  employees,
}: {
  payPeriodId: string;
  row: UnmatchedPayrollReportRow;
  employees: { id: string; name: string; email: string }[];
}) {
  const action = attachUnmatchedPayrollReportAction.bind(null, row.id, payPeriodId);
  const [state, formAction] = useFormState<AttachUnmatchedState, FormData>(action, {});
  const [dismissing, startDismiss] = useTransition();

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-amber-900">
          Cleaner named <span className="font-medium">&ldquo;{row.rawName}&rdquo;</span> from the import
          doesn&apos;t match anyone on file.
        </p>
        <select
          name="employeeId"
          required
          defaultValue=""
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        >
          <option value="" disabled>
            Attach to employee...
          </option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.email})
            </option>
          ))}
        </select>
        <AttachButton />
        <button
          type="button"
          disabled={dismissing}
          onClick={() => startDismiss(() => dismissUnmatchedPayrollReportAction(row.id, payPeriodId))}
          className="text-xs font-medium text-neutral-500 hover:underline disabled:opacity-60"
        >
          Dismiss
        </button>
      </form>
      {state?.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
      <p className="mt-1 text-xs text-amber-700">
        Attaching saves &ldquo;{row.rawName}&rdquo; as an alias on that employee, so future imports with
        this same name match automatically.
      </p>
    </div>
  );
}

export default function UnmatchedPayrollReports({
  payPeriodId,
  unmatched,
  employees,
}: {
  payPeriodId: string;
  unmatched: UnmatchedPayrollReportRow[];
  employees: { id: string; name: string; email: string }[];
}) {
  if (unmatched.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium uppercase tracking-wide text-amber-800">
        Unmatched Cleaners from Import
      </h2>
      {unmatched.map((row) => (
        <Row key={row.id} payPeriodId={payPeriodId} row={row} employees={employees} />
      ))}
    </div>
  );
}
