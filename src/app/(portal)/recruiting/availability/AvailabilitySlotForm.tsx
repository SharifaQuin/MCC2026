"use client";

import { useFormState, useFormStatus } from "react-dom";
import Button from "@/components/ds/Button";
import { createAvailabilitySlotAction, type CreateSlotState } from "./actions";

const initialState: CreateSlotState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add Slot"}
    </Button>
  );
}

export default function AvailabilitySlotForm({
  postings,
}: {
  postings: { id: string; titleEn: string }[];
}) {
  const [state, formAction] = useFormState(createAvailabilitySlotAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm font-semibold text-brand-800">Add an available interview time</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
          Date
          <input type="date" name="slotDate" required className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
          Time (Pacific)
          <input type="time" name="slotTime" required className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
          Duration
          <select name="durationMins" defaultValue="30" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
            <option value="15">15 min</option>
            <option value="30">30 min</option>
            <option value="45">45 min</option>
            <option value="60">60 min</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
          Only for posting (optional)
          <select name="jobPostingId" defaultValue="" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
            <option value="">General availability</option>
            {postings.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titleEn}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
