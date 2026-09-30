import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { prisma } from "@/lib/prisma";
import SlotFeedUploadForm from "./SlotFeedUploadForm";

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

  return (
    <div className="max-w-3xl">
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
