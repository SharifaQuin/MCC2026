import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { prisma } from "@/lib/prisma";
import { resolveActiveSlotMonth, getSlotCapacityMonthSummary, getSlotCapacityDayBreakdown } from "@/lib/slotCapacitySummary";
import SlotFeedUploadForm from "./SlotFeedUploadForm";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default async function SlotCapacityPage() {
  await requireDepartmentAccess("MANAGEMENT");

  const months = await prisma.slotFeedMonth.findMany({
    orderBy: { month: "desc" },
    select: {
      month: true,
      importedAt: true,
      importedBy: { select: { name: true } },
      _count: { select: { dates: true } },
    },
  });

  const activeMonth = await resolveActiveSlotMonth();
  const summary = activeMonth ? await getSlotCapacityMonthSummary(activeMonth) : null;
  const days = activeMonth ? await getSlotCapacityDayBreakdown(activeMonth) : [];

  return (
    <div className="max-w-5xl">
      <Link href="/management" className="text-sm text-brand-700 hover:underline">
        ← Back to Management
      </Link>

      <h1 className="mt-3 text-xl font-semibold">Slot Booking Capacity Feed</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Upload the owner&apos;s monthly capacity review (<code>open_slots_YYYY-MM.json</code>,
        schema <code>mcc-open-slots/v1</code>). Reps use this to see real open availability and
        book against it from the Pricing Calculator. Loading a new file for a month replaces that
        month&apos;s capacity — any bookings already made through the engine stay in place and
        keep subtracting from the new numbers.
      </p>

      <div className="mt-6">
        <SlotFeedUploadForm />
      </div>

      {summary && (
        <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">{summary.month} at a glance</h2>
          <p className="mt-1 text-xs text-neutral-500">
            {summary.daysPassed} day{summary.daysPassed === 1 ? "" : "s"} passed ·{" "}
            {summary.daysRemaining} day{summary.daysRemaining === 1 ? "" : "s"} left to fill
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-md bg-neutral-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Total Open (Month)</p>
              <p className="mt-0.5 text-lg font-semibold text-neutral-900">{money(summary.totalOpenDollars)}</p>
            </div>
            <div className="rounded-md bg-neutral-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Still Fillable</p>
              <p className="mt-0.5 text-lg font-semibold text-neutral-900">{money(summary.openRemainingDollars)}</p>
            </div>
            <div className="rounded-md bg-green-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-green-700">Booked via Engine</p>
              <p className="mt-0.5 text-lg font-semibold text-green-800">{money(summary.bookedDollars)}</p>
            </div>
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-red-700">Lost (Days Passed)</p>
              <p className="mt-0.5 text-lg font-semibold text-red-700">{money(summary.lostDollars)}</p>
            </div>
          </div>

          {days.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Open $</th>
                    <th className="py-2 pr-4">Booked $</th>
                    <th className="py-2 pr-4">Lost $</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date} className={`border-b border-neutral-100 ${d.isPast ? "text-neutral-400" : "text-neutral-800"}`}>
                      <td className="py-1.5 pr-4 whitespace-nowrap">
                        {d.weekday}, {d.date}
                      </td>
                      <td className="py-1.5 pr-4">{d.status}</td>
                      <td className="py-1.5 pr-4">{money(d.openDollars)}</td>
                      <td className="py-1.5 pr-4">{money(d.bookedDollars)}</td>
                      <td className="py-1.5 pr-4">
                        {d.lostDollars !== null ? (
                          <span className={d.lostDollars > 0 ? "font-medium text-red-600" : "text-neutral-400"}>
                            {money(d.lostDollars)}
                          </span>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-neutral-400">
                A date shows Lost $ once it's passed — snapshotted automatically overnight so it
                survives the next month's feed replacing this one.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-700">Loaded months</h2>
        {months.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">No capacity feed loaded yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white text-sm">
            {months.map((m) => (
              <li key={m.month} className="flex items-center justify-between px-4 py-2">
                <span className="font-medium">{m.month}</span>
                <span className="text-neutral-500">
                  {m._count.dates} dates · imported {new Date(m.importedAt).toLocaleDateString()}
                  {m.importedBy ? ` by ${m.importedBy.name}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
