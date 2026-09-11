"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createPayPeriodAction, PayPeriodState } from "@/app/actions/payroll";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Creating..." : "Create Pay Period"}
    </button>
  );
}

export default function NewPayPeriodForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<PayPeriodState, FormData>(createPayPeriodAction, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-neutral-300 py-3 text-sm font-medium text-neutral-500 hover:border-brand-400 hover:text-brand-600"
      >
        + New Pay Period
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium">Label</label>
        <input
          name="label"
          required
          placeholder="e.g. Sep 1 – Sep 14, 2026"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Start date</label>
          <input
            type="date"
            name="startDate"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">End date</label>
          <input
            type="date"
            name="endDate"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-medium text-neutral-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
