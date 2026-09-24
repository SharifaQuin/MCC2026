"use client";

import { useTransition } from "react";
import { deleteAvailabilitySlotAction } from "./actions";

export default function DeleteSlotButton({ slotId }: { slotId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => deleteAvailabilitySlotAction(slotId))}
      className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
