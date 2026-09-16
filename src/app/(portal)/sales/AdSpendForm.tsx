"use client";

import { useState, useTransition } from "react";
import { setLeadSourceSpendAction } from "./actions";

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "FACEBOOK_ADS", label: "Facebook Ads" },
  { value: "NEXTDOOR", label: "Nextdoor" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "WEBSITE_FORM", label: "Website Form" },
  { value: "REFERRAL", label: "Referral" },
  { value: "PHONE_CALL", label: "Phone Call" },
  { value: "WALK_IN", label: "Walk-in" },
  { value: "OTHER", label: "Other" },
];

export default function AdSpendForm({
  currentSpend = {},
  monthLabel,
}: {
  currentSpend?: Record<string, number>;
  monthLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [source, setSource] = useState("GOOGLE_ADS");
  const [amount, setAmount] = useState(String(currentSpend["GOOGLE_ADS"] ?? ""));
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSourceChange(next: string) {
    setSource(next);
    setAmount(currentSpend[next] ? String(currentSpend[next]) : "");
    setSavedMessage(null);
    setErrorMessage(null);
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          setSavedMessage(null);
          setErrorMessage(null);
          const result = await setLeadSourceSpendAction(formData);
          if (!result.ok) {
            setErrorMessage(result.error);
            return;
          }
          const sourceLabel = SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? source;
          setSavedMessage(`Saved $${result.amountSpent.toFixed(2)} for ${sourceLabel} — ${monthLabel}.`);
        })
      }
      className="flex flex-wrap items-end gap-3"
    >
      <div>
        <label className="block text-xs font-medium text-neutral-500">Source</label>
        <select
          name="source"
          value={source}
          onChange={(e) => handleSourceChange(e.target.value)}
          className="mt-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-500">
          {monthLabel}&rsquo;s spend
        </label>
        <div className="mt-1 flex items-center gap-1">
          <span className="text-neutral-500">$</span>
          <input
            type="number"
            name="amountSpent"
            min={0}
            step="0.01"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save Spend"}
      </button>
      {savedMessage && !pending && (
        <p className="text-sm font-medium text-green-700">✓ {savedMessage}</p>
      )}
      {errorMessage && !pending && (
        <p className="text-sm font-medium text-red-700">{errorMessage}</p>
      )}
    </form>
  );
}
