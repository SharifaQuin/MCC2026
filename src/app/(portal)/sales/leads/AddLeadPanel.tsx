"use client";

import { useState } from "react";
import { createManualLeadAction } from "./actions";

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "PHONE_CALL", label: "Phone Call" },
  { value: "WALK_IN", label: "Walk-in" },
  { value: "REFERRAL", label: "Referral" },
  { value: "NEXTDOOR", label: "Nextdoor" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "OTHER", label: "Other" },
];

export default function AddLeadPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        {open ? "Close" : "+ Add Lead"}
      </button>

      {open && (
        <form
          action={createManualLeadAction}
          className="mt-3 space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
        >
          <p className="text-sm text-neutral-500">
            For a phone call, walk-in, or referral that didn&apos;t come through the website form.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">First Name *</label>
              <input
                name="firstName"
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Last Name *</label>
              <input
                name="lastName"
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Email *</label>
              <input
                type="email"
                name="email"
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Phone *</label>
              <input
                type="tel"
                name="phone"
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Source</label>
              <select
                name="source"
                defaultValue="PHONE_CALL"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Service Interest
              </label>
              <input
                name="serviceInterest"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">Notes</label>
            <textarea
              name="notes"
              rows={2}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Add Lead
          </button>
        </form>
      )}
    </div>
  );
}
