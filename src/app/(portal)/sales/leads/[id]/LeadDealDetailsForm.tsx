"use client";

import { useState, useTransition } from "react";
import { setLeadDealDetailsAction, markLeadFollowUpDoneAction } from "../actions";

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
  const [markDonePending, startMarkDoneTransition] = useTransition();
  const [markDoneError, setMarkDoneError] = useState<string | null>(null);

  function handleMarkDone() {
    setMarkDoneError(null);
    startMarkDoneTransition(async () => {
      const result = await markLeadFollowUpDoneAction(leadId);
      if (!result.ok) setMarkDoneError(result.error);
    });
  }

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
          // Forces the uncontrolled input to pick up a new value after a
          // server revalidation (e.g. right after "Mark follow-up done"
          // clears it) — React only re-reads defaultValue when the input
          // itself remounts.
          key={followUpDueAt ?? "none"}
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
      {followUpDueAt && (
        <button
          type="button"
          onClick={handleMarkDone}
          disabled={markDonePending}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
        >
          {markDonePending ? "Marking done..." : "Mark follow-up done"}
        </button>
      )}
      {markDoneError && <p className="w-full text-sm text-red-600">{markDoneError}</p>}
    </form>
  );
}
