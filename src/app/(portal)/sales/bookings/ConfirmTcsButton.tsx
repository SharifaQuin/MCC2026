"use client";

import { useState, useTransition } from "react";
import { confirmBookingEnteredInTcsAction } from "@/app/actions/slotCapacity";

// Persistent counterpart to NextOpenSlotsCard's ephemeral TcsCheckbox — this
// one lives on the durable bookings list, so it still works after a reload,
// a new tab, or the 15-minute hold window passing. setEnteredInTcs itself
// re-checks capacity for an expired hold before confirming it, so a click
// here can legitimately fail with an overbooking message; that's shown
// inline rather than silently swallowed.
export default function ConfirmTcsButton({ bookingId }: { bookingId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return <span className="text-xs font-medium text-green-700">Confirmed ✓</span>;
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await confirmBookingEnteredInTcsAction(bookingId);
            if (result.ok) {
              setDone(true);
            } else {
              setError(result.reason);
            }
          })
        }
        className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
      >
        {pending ? "Confirming..." : "Confirm: Entered in TCS"}
      </button>
      {error && <p className="mt-1 max-w-[16rem] text-xs text-red-600">{error}</p>}
    </div>
  );
}
