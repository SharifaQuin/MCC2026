"use client";

import { useTransition, useState } from "react";
import { updateQuoteNextStepAction } from "./actions";

// Compact inline editor for a pending quote's Next Step / Follow-up Date —
// only ever rendered for a pending quote the viewer can edit (see
// page.tsx); a won/lost quote always shows the stored value as plain text.
export default function QuoteNextStepForm({
  quoteId,
  nextStep,
  followUpDate,
}: {
  quoteId: string;
  nextStep: string | null;
  followUpDate: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          setError(null);
          const result = await updateQuoteNextStepAction(quoteId, formData);
          if (!result.ok) setError(result.error);
        })
      }
      className="flex flex-col gap-1.5"
    >
      <input
        type="text"
        name="nextStep"
        defaultValue={nextStep ?? ""}
        placeholder="e.g. Call to confirm Tuesday"
        className="w-44 rounded-md border border-neutral-300 px-2 py-1 text-xs"
      />
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          name="followUpDate"
          defaultValue={followUpDate ?? ""}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "..." : "Save"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
