"use client";

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

export default function AdSpendForm() {
  return (
    <form action={setLeadSourceSpendAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-neutral-500">Source</label>
        <select
          name="source"
          defaultValue="GOOGLE_ADS"
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
        <label className="block text-xs font-medium text-neutral-500">This month&rsquo;s spend</label>
        <div className="mt-1 flex items-center gap-1">
          <span className="text-neutral-500">$</span>
          <input
            type="number"
            name="amountSpent"
            min={0}
            step="0.01"
            placeholder="0"
            className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <button
        type="submit"
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Save Spend
      </button>
    </form>
  );
}
