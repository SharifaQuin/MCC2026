"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { manualBookSlotAction, type ManualBookState } from "@/app/actions/slotCapacity";
import type { NextOpenSlot } from "@/lib/slotCapacitySummary";

function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Booking..." : "Confirm Booking"}
    </button>
  );
}

function TcsCheckbox({ bookingId }: { bookingId: string }) {
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <label className="flex items-center gap-1.5 text-xs font-medium text-green-700">
      <input
        type="checkbox"
        checked={checked}
        disabled={saving}
        onChange={async (e) => {
          const next = e.target.checked;
          setChecked(next);
          setSaving(true);
          try {
            await fetch("/api/sales/slot-recommender/confirm-tcs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bookingId, entered: next }),
            });
          } finally {
            setSaving(false);
          }
        }}
      />
      Entered in TCS
    </label>
  );
}

function SlotRow({ slot, index, month }: { slot: NextOpenSlot; index: number; month: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ManualBookState, FormData>(manualBookSlotAction, {});

  if (state.bookingId) {
    return (
      <li className="py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-50 text-xs font-semibold text-green-700">
              ✓
            </span>
            <p className="text-sm font-medium text-neutral-900">
              {slot.weekday}, {formatDate(slot.date)} · {slot.window} — Held, releases in 15 min if not confirmed
            </p>
          </div>
          <TcsCheckbox bookingId={state.bookingId} />
        </div>
      </li>
    );
  }

  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
            {index + 1}
          </span>
          <div>
            <p className="text-sm font-medium text-neutral-900">
              {slot.weekday}, {formatDate(slot.date)} · {slot.window}
            </p>
            <p className="text-xs text-neutral-500">
              {slot.block} · {slot.teamsOpen} team{slot.teamsOpen === 1 ? "" : "s"} open
              {slot.windowValuePerHour ? ` · ~$${Math.round(slot.windowValuePerHour)}/hr` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {open ? "Cancel" : "Book for a call-in client"}
        </button>
      </div>

      {open && (
        <form action={formAction} className="mt-3 ml-9 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="date" value={slot.date} />
          <input type="hidden" name="block" value={slot.block} />
          <input type="hidden" name="window" value={slot.window} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-neutral-600">Client name</label>
              <input
                name="clientName"
                required
                className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                placeholder="e.g. Priya Shah"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600">Address or city</label>
              <input
                name="addressOrCity"
                required
                className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                placeholder="e.g. Irvine, CA"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600">Estimated hours</label>
              <input
                name="personHours"
                type="number"
                min="0.5"
                step="0.5"
                required
                className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                placeholder="e.g. 3"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600">Price (optional)</label>
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                placeholder="e.g. 220"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-neutral-600">Frequency</label>
              <select
                name="frequency"
                defaultValue="onetime"
                className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                <option value="onetime">One-Time</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-Weekly</option>
                <option value="triweekly">Tri-Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
          {state.error && <p className="text-xs text-red-600">{state.error}</p>}
          <SubmitButton />
        </form>
      )}
    </li>
  );
}

export default function NextOpenSlotsCard({ slots, month }: { slots: NextOpenSlot[]; month: string }) {
  if (slots.length === 0) {
    return (
      <p className="mt-3 text-sm text-neutral-500">
        No open slots left to offer in {month} — check next month&rsquo;s feed, or ask the owner about
        overtime.
      </p>
    );
  }

  return (
    <ul className="mt-4 divide-y divide-neutral-100">
      {slots.map((s, i) => (
        <SlotRow key={`${s.date}-${s.block}-${s.window}`} slot={s} index={i} month={month} />
      ))}
    </ul>
  );
}
