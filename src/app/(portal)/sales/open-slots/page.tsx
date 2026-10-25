import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { resolveActiveSlotMonth, getNextOpenSlots, listLoadedSlotMonths } from "@/lib/slotCapacitySummary";
import NextOpenSlotsCard from "../NextOpenSlotsCard";

export const dynamic = "force-dynamic";

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Every open team slot for a given month, not just the soonest 5 on the
// Sales dashboard — for an old client calling in asking for a specific day
// further out than the top of the list, possibly in a different month than
// the one currently "active." getNextOpenSlots already walks the whole
// month, so a high limit here just means "don't stop early." Month-to-month
// navigation is constrained to months that actually have a loaded capacity
// feed (never fabricated or implied for one that doesn't) — an explicit
// ?month= outside that set falls back to the same default behavior as
// having none at all.
export default async function OpenSlotsPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  await requireDepartmentAccess("SALES");

  const loadedMonths = await listLoadedSlotMonths();
  const requestedMonth = searchParams.month;
  const activeSlotMonth =
    requestedMonth && loadedMonths.includes(requestedMonth) ? requestedMonth : await resolveActiveSlotMonth();
  const slots = activeSlotMonth ? await getNextOpenSlots(activeSlotMonth, 500) : [];

  const currentIndex = activeSlotMonth ? loadedMonths.indexOf(activeSlotMonth) : -1;
  const prevMonth = currentIndex > 0 ? loadedMonths[currentIndex - 1] : null;
  const nextMonth = currentIndex !== -1 && currentIndex < loadedMonths.length - 1 ? loadedMonths[currentIndex + 1] : null;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Open Time Slots</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {activeSlotMonth
              ? `Every open team slot still available in ${monthLabel(activeSlotMonth)}, earliest first.`
              : "Every open team slot still available this month, earliest first."}
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

      {loadedMonths.length > 1 && (
        <div className="mb-4 flex items-center gap-3 text-sm">
          {prevMonth ? (
            <Link href={`/sales/open-slots?month=${prevMonth}`} className="font-medium text-brand-700 hover:underline">
              ← {monthLabel(prevMonth)}
            </Link>
          ) : (
            <span className="text-neutral-300">← No earlier loaded month</span>
          )}
          <span className="text-neutral-300">|</span>
          {nextMonth ? (
            <Link href={`/sales/open-slots?month=${nextMonth}`} className="font-medium text-brand-700 hover:underline">
              {monthLabel(nextMonth)} →
            </Link>
          ) : (
            <span className="text-neutral-300">No later loaded month →</span>
          )}
        </div>
      )}

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
