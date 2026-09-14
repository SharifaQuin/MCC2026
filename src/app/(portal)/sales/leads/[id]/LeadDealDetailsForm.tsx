"use client";

import { useTransition } from "react";
import { setLeadDealDetailsAction } from "../actions";

export default function LeadDealDetailsForm({
  leadId,
  estimatedValue,
  quoteKey,
  followUpDueAt,
}: {
  leadId: string;
  estimatedValue: number | null;
  quoteKey: string | null;
  followUpDueAt: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(() => setLeadDealDetailsAction(leadId, formData))}
      className="flex flex-wrap items-end gap-3"
    >
      <div>
        <label className="block text-xs font-medium text-neutral-500">Estimated Value</label>
        <div className="mt-1 flex items-center gap-1">
          <span className="text-neutral-500">$</span>
          <input
            type="number"
            name="estimatedValue"
            min={0}
            step="0.01"
            defaultValue={estimatedValue ?? ""}
            placeholder="0"
            className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-500">Quote Reference</label>
        <input
          name="quoteKey"
          defaultValue={quoteKey ?? ""}
          placeholder="Pricing tool quote ID"
          className="mt-1 w-40 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-500">Follow-up Due</label>
        <input
          type="date"
          name="followUpDate"
          defaultValue={followUpDueAt ? followUpDueAt.slice(0, 10) : ""}
          className="mt-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
