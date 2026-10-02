import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { prisma } from "@/lib/prisma";
import { resolveActiveSlotMonth } from "@/lib/slotCapacitySummary";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const STATUS_STYLES: Record<string, string> = {
  HOLD: "bg-amber-100 text-amber-700",
  EXPIRED: "bg-neutral-100 text-neutral-500",
  CONFIRMED: "bg-green-100 text-green-700",
  RELEASED: "bg-neutral-100 text-neutral-500",
};

// A HOLD never flips to a different status when its 15-minute window lapses
// — the engine just stops counting it as active (holdExpiresAt < now) and
// the slot opens back up. Shown as "Expired" here rather than a stale
// "Hold" badge that would wrongly suggest it's still pending confirmation.
function displayStatus(b: { status: string; holdExpiresAt: Date | null }): string {
  if (b.status === "HOLD" && b.holdExpiresAt && b.holdExpiresAt.getTime() < Date.now()) return "EXPIRED";
  return b.status;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

// Answers "which days did I book" — nowhere else in the app lists individual
// SlotBooking rows back to a rep, so after using "Book for a call-in
// client" (on the Sales dashboard or /sales/open-slots) the only feedback
// was a transient inline "Held..." message that didn't survive leaving the
// page. This is the durable view: every booking for the active capacity
// month, earliest first, covering both call-in bookings (clientName) and
// quote-originated ones (leadId).
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  await requireDepartmentAccess("SALES");

  const activeMonth = await resolveActiveSlotMonth();
  const month = searchParams.month || activeMonth;

  const loadedMonths = await prisma.slotFeedMonth.findMany({
    orderBy: { month: "desc" },
    select: { month: true },
  });

  const bookings = month
    ? await prisma.slotBooking.findMany({
        where: { month },
        orderBy: [{ date: "asc" }, { block: "asc" }, { window: "asc" }],
        include: {
          lead: { select: { firstName: true, lastName: true } },
          rep: { select: { name: true } },
        },
      })
    : [];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Booked Slots</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Every slot booked this month, earliest first — call-in bookings and quote-originated
            ones together.
          </p>
        </div>
        <Link href="/sales" className="shrink-0 text-sm font-medium text-brand-700 hover:underline">
          ← Back to Sales
        </Link>
      </div>

      {loadedMonths.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {loadedMonths.map((m) => (
            <Link
              key={m.month}
              href={`/sales/bookings?month=${m.month}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                m.month === month ? "bg-brand-600 text-white" : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {m.month}
            </Link>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        {!month ? (
          <p className="text-sm text-neutral-500">No capacity feed loaded yet.</p>
        ) : bookings.length === 0 ? (
          <p className="text-sm text-neutral-500">No slots booked yet for {month}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Block / Window</th>
                  <th className="py-2 pr-4">Client</th>
                  <th className="py-2 pr-4">City</th>
                  <th className="py-2 pr-4">Hours</th>
                  <th className="py-2 pr-4">Price</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Rep</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const clientLabel = b.clientName || (b.lead ? `${b.lead.firstName} ${b.lead.lastName}` : "—");
                  const status = displayStatus(b);
                  return (
                    <tr key={b.id} className="border-b border-neutral-100 text-neutral-800">
                      <td className="py-1.5 pr-4 whitespace-nowrap">{formatDate(b.date)}</td>
                      <td className="py-1.5 pr-4 whitespace-nowrap">
                        {b.block} · {b.window}
                      </td>
                      <td className="py-1.5 pr-4">{clientLabel}</td>
                      <td className="py-1.5 pr-4">{b.city}</td>
                      <td className="py-1.5 pr-4">{b.personHours}</td>
                      <td className="py-1.5 pr-4">{b.price != null ? money(b.price) : "—"}</td>
                      <td className="py-1.5 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? ""}`}>
                          {status}
                        </span>
                      </td>
                      <td className="py-1.5 pr-4 whitespace-nowrap text-neutral-500">{b.rep.name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-neutral-400">
              A Hold expires 15 minutes after booking if it isn&rsquo;t confirmed in TCS — shown here
              as Expired once that happens, and the slot opens back up automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
