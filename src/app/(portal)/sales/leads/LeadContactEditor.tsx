"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateLeadContactInfoAction, type LeadContactInfoFormState } from "./actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

// Inline email/phone correction for a lead — mirrors
// ContactInfoEditor.tsx's (the applicant-side editor) toggle-to-edit-mode
// pattern exactly. Shown to every office role that can view this lead,
// including a view-only Office Assistant — this is contact-correction
// authority only, never gated on the page's own broader canEdit. hasQuote
// is passed in from the page (lead.quoteKey != null) so the warning shows
// before saving, not just after.
export default function LeadContactEditor({
  leadId,
  email,
  phone,
  hasQuote,
}: {
  leadId: string;
  email: string;
  phone: string;
  hasQuote: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const boundAction = updateLeadContactInfoAction.bind(null, leadId);
  const [state, formAction] = useFormState<LeadContactInfoFormState, FormData>(boundAction, {});

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1 text-xs font-medium text-brand-700 hover:underline"
      >
        Edit contact info
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Email</label>
        <input
          name="email"
          type="text"
          defaultValue={email}
          required
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Phone</label>
        <input
          name="phone"
          type="tel"
          defaultValue={phone}
          required
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      {hasQuote && (
        <p className="text-xs text-amber-700">
          ⚠ This lead has a saved quote. Saving here will NOT regenerate or alter it — the quote may
          still show the previous contact details.
        </p>
      )}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <SaveButton />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
