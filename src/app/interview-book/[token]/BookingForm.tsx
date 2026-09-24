"use client";

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { bookInterviewSlotAction, type BookSlotState } from "./actions";
import { SuccessState } from "@/components/ds/EmptyState";

export interface BookableSlot {
  id: string;
  label: string;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full rounded-lg bg-brand-600 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
    >
      {pending ? "Booking…" : "Confirm This Time"}
    </button>
  );
}

// Booking regenerates the applicant's confirm token server-side (a fresh
// one is needed for the day-of confirm/decline flow), which means the
// token this page was loaded with stops working the instant booking
// succeeds. So success is shown entirely client-side from the action's
// returned state — never by re-fetching the page with the now-stale token.
export default function BookingForm({ token, slots }: { token: string; slots: BookableSlot[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const boundAction = bookInterviewSlotAction.bind(null, token);
  const [state, formAction] = useFormState<BookSlotState, FormData>(boundAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  if (state.success) {
    return (
      <SuccessState
        title="You're booked!"
        description="We've sent you a confirmation, and we'll remind you again as it gets closer. See you then!"
      />
    );
  }

  if (slots.length === 0) {
    return (
      <p className="rounded-lg bg-neutral-100 p-4 text-center text-sm text-neutral-600">
        There aren't any open times right now — please check back soon or reach out to us directly.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      // Deliberately not `action={formAction}` directly: Next 14's form-
      // action FormData capture is unreliable for a controlled field (this
      // radio) that changed in the same interaction as the submit click —
      // confirmed by testing, the DOM/state value is correct but the
      // framework's own snapshot drops it. Building FormData ourselves at
      // submit time and dispatching it to the same action sidesteps that.
      onSubmit={(e) => {
        e.preventDefault();
        if (formRef.current) formAction(new FormData(formRef.current));
      }}
      className="space-y-3"
    >
      <div className="space-y-2">
        {slots.map((slot) => (
          <label
            key={slot.id}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3.5 text-sm font-medium transition ${
              selected === slot.id
                ? "border-brand-500 bg-brand-50 text-brand-800"
                : "border-neutral-200 text-neutral-700 hover:border-brand-300"
            }`}
          >
            <input
              type="radio"
              name="slotId"
              value={slot.id}
              checked={selected === slot.id}
              onChange={() => setSelected(slot.id)}
              className="h-4 w-4"
            />
            {slot.label}
          </label>
        ))}
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <SubmitButton disabled={!selected} />
    </form>
  );
}
