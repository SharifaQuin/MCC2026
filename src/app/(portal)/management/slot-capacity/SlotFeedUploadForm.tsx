"use client";

import { useFormState, useFormStatus } from "react-dom";
import { importSlotFeedAction, SlotFeedImportState } from "@/app/actions/slotCapacity";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Importing..." : "Import Feed"}
    </button>
  );
}

export default function SlotFeedUploadForm() {
  const [state, formAction] = useFormState<SlotFeedImportState, FormData>(importSlotFeedAction, {});

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium">Capacity feed (.json)</label>
        <input
          type="file"
          name="feedFile"
          accept=".json,application/json"
          required
          className="block w-full text-sm"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.imported && (
        <p className="text-sm text-green-700">
          Loaded {state.imported.month}: {state.imported.dateCount} dates, $
          {state.imported.totalOpenDollars.toLocaleString()} open capacity.
          {state.imported.replacesExisting ? " Replaced the previously-loaded feed for this month." : ""}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
