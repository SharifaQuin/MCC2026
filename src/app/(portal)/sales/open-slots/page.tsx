import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { resolveActiveSlotMonth, getNextOpenSlots } from "@/lib/slotCapacitySummary";
import NextOpenSlotsCard from "../NextOpenSlotsCard";

export const dynamic = "force-dynamic";

// Every open team slot for the active month, not just the soonest 5 on the
// Sales dashboard — for an old client calling in asking for a specific day
// further out than the top of the list. Same booking form per slot as the
// dashboard card; getNextOpenSlots already walks the whole month, so a high
// limit here just means "don't stop early."
export default async function OpenSlotsPage() {
  await requireDepartmentAccess("SALES");

  const activeSlotMonth = await resolveActiveSlotMonth();
  const slots = activeSlotMonth ? await getNextOpenSlots(activeSlotMonth, 500) : [];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Open Time Slots</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Every open team slot still available this month, earliest first.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Link href="/sales/bookings" className="text-sm font-medium text-brand-700 hover:underline">
            View booked slots →
          </Link>
          <Link href="/sales" className="text-sm font-medium text-brand-700 hover:underline">
            ← Back to Sales
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        {activeSlotMonth ? (
          <NextOpenSlotsCard slots={slots} month={activeSlotMonth} />
        ) : (
          <p className="text-sm text-neutral-500">
            No capacity feed loaded for this month yet — ask Management to upload it under Slot Capacity.
          </p>
        )}
      </div>
    </div>
  );
}
