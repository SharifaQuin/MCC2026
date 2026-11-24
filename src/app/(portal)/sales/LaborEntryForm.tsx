"use client";

import { useState, useTransition } from "react";
import { saveSalesLaborAction } from "./actions";

export default function LaborEntryForm({
  monthKey,
  defaultValue,
}: {
  monthKey: string;
  defaultValue: string;
}) {
  const [pending, startTransition] = useTransition();
  const [labor, setLabor] = useState(defaultValue);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <form
      action={() =>
        startTransition(async () => {
          setSavedMessage(null);
          setErrorMessage(null);
          const formData = new FormData();
          formData.set("monthKey", monthKey);
          formData.set("labor", labor);
          const result = await saveSalesLaborAction(formData);
          if (!result.ok) {
            setErrorMessage(result.error);
            return;
          }
          setSavedMessage(`Saved labor for ${monthKey}.`);
        })
      }
      className="mt-3 flex flex-wrap items-end gap-3"
    >
      <div>
        <label htmlFor="labor" className="block text-xs font-medium text-neutral-500">
          Labor cost so far
        </label>
        <div className="mt-1 flex items-center gap-1">
          <span className="text-neutral-500">$</span>
          <input
            type="number"
            id="labor"
            min={0}
            step="0.01"
            value={labor}
            onChange={(e) => setLabor(e.target.value)}
            placeholder="0"
            className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save Labor"}
      </button>
      {savedMessage && !pending && <p className="text-sm font-medium text-green-700">✓ {savedMessage}</p>}
      {errorMessage && !pending && <p className="text-sm font-medium text-red-700">{errorMessage}</p>}
    </form>
  );
}
