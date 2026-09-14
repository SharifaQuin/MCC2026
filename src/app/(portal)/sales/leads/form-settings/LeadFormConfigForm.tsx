"use client";

import { useTransition } from "react";
import { setLeadFormConfigAction } from "./actions";
import type { LeadFormConfig } from "@/lib/leads";

export default function LeadFormConfigForm({ config }: { config: LeadFormConfig }) {
  const [pending, startTransition] = useTransition();

  return (
    <form action={(formData) => startTransition(() => setLeadFormConfigAction(formData))} className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700">Page Text</h3>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">Headline</label>
          <input
            name="headline"
            defaultValue={config.headline}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">Intro Text</label>
          <textarea
            name="intro"
            rows={2}
            defaultValue={config.intro}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">Submit Button Text</label>
          <input
            name="submitLabel"
            defaultValue={config.submitLabel}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-neutral-200 pt-4">
        <h3 className="text-sm font-semibold text-neutral-700">Standard Fields</h3>
        <p className="text-xs text-neutral-500">
          Name, email, and phone always show and are always required — too much of the app (texting,
          email, duplicate detection) depends on them.
        </p>

        {[
          { key: "address", label: "Address field", defaultLabel: config.addressLabel, enabled: config.addressEnabled, required: config.addressRequired },
          { key: "serviceInterest", label: "Service Interest field", defaultLabel: config.serviceInterestLabel, enabled: config.serviceInterestEnabled, required: config.serviceInterestRequired },
          { key: "message", label: "Message field", defaultLabel: config.messageLabel, enabled: config.messageEnabled, required: config.messageRequired },
        ].map((f) => (
          <div key={f.key} className="rounded-md border border-neutral-200 p-3">
            <p className="mb-2 text-xs font-medium text-neutral-500">{f.label}</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <input
                name={`${f.key}Label`}
                defaultValue={f.defaultLabel}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-neutral-700">
                <input type="checkbox" name={`${f.key}Enabled`} defaultChecked={f.enabled} className="h-4 w-4" />
                Show
              </label>
              <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-neutral-700">
                <input type="checkbox" name={`${f.key}Required`} defaultChecked={f.required} className="h-4 w-4" />
                Required
              </label>
            </div>
          </div>
        ))}
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
