import type { SlotBookingStatus } from "@prisma/client";

export interface OperationalBookingRow {
  id: string;
  date: string;
  block: string;
  window: string;
  city: string;
  status: SlotBookingStatus;
  clientName: string | null;
}

const STATUS_LABELS: Record<SlotBookingStatus, string> = {
  HOLD: "Hold",
  CONFIRMED: "Confirmed",
  RELEASED: "Released",
};

// Deliberately minimal and non-financial: date/block/window/city/status
// only. No price, capacity, staffing/pay, or route-assignment data — none
// of that is queried for this view, not just hidden from it.
export default function OfficeAssistantOperationalStatus({ bookings }: { bookings: OperationalBookingRow[] }) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Operational Status</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Upcoming scheduled service blocks — view only. To flag an issue or follow-up, use your To-Do
        list.
      </p>

      {bookings.length === 0 ? (
        <p className="text-sm text-neutral-400">No upcoming bookings.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Block</th>
                <th className="px-4 py-3">Window</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3 text-neutral-600">{new Date(b.date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-neutral-600">{b.block}</td>
                  <td className="px-4 py-3 text-neutral-600">{b.window}</td>
                  <td className="px-4 py-3 text-neutral-600">{b.city}</td>
                  <td className="px-4 py-3 text-neutral-600">{STATUS_LABELS[b.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
