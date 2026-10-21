"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateApplicantContactInfoAction, type ContactInfoFormState } from "../actions";

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

// Inline edit for an applicant's own email/phone — mirrors the toggle-to-
// edit-mode pattern StageControls already uses elsewhere on this page.
// Deliberately narrow: this never touches stage, scheduledAt, or any
// calendar event, and never resends anything on its own — it only ever
// updates Applicant.email/phone and records a visible history entry (see
// updateApplicantContactInfoAction). hasStaleCalendarInvite is passed in
// from the page (it already knows whether a calendar event exists for this
// applicant) so the warning shows before saving, not just after.
export default function ContactInfoEditor({
  applicantId,
  email,
  phone,
  canEdit,
  hasStaleCalendarInvite,
}: {
  applicantId: string;
  email: string;
  phone: string;
  canEdit: boolean;
  hasStaleCalendarInvite: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const boundAction = updateApplicantContactInfoAction.bind(null, applicantId);
  const [state, formAction] = useFormState<ContactInfoFormState, FormData>(boundAction, {});

  // A successful save collapses the form back to the (now server-refreshed)
  // view state — the parent page re-renders with the new email/phone once
  // revalidatePath takes effect, so there's nothing left for the form to show.
  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state]);

  if (!canEdit) return null;

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
    <form
      action={formAction}
      className="mt-2 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Email</label>
        <input
          name="email"
          // Plain text, not type="email" — the browser's own native email
          // validation would otherwise silently block submission before
          // our server-side check ever runs, showing its own tooltip
          // instead of the clear in-app error this form is meant to give.
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
      {hasStaleCalendarInvite && (
        <p className="text-xs text-amber-700">
          ⚠ This applicant has an existing calendar invitation. Saving here will NOT update
          it — the invite may still show the previous contact details.
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
