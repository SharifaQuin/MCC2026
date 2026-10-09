import Link from "next/link";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { getBusinessHours } from "@/lib/businessHours";
import { setBusinessHoursAction } from "../actions";

const WEEKDAYS: { key: string; iso: number; label: string }[] = [
  { key: "mon", iso: 1, label: "Mon" },
  { key: "tue", iso: 2, label: "Tue" },
  { key: "wed", iso: 3, label: "Wed" },
  { key: "thu", iso: 4, label: "Thu" },
  { key: "fri", iso: 5, label: "Fri" },
  { key: "sat", iso: 6, label: "Sat" },
  { key: "sun", iso: 7, label: "Sun" },
];

function toTimeInput(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Drives two things elsewhere in the app: the after-hours lead auto-reply
// (outside these hours, a new web-form lead gets the auto-reply text) and,
// indirectly, nothing else yet — kept as its own setting rather than
// hard-coded so the owner can change it without a code change as real
// hours shift (e.g. holiday hours, a schedule change).
export default async function BusinessHoursPage() {
  const { canEdit } = await requireDepartmentAccess("MANAGEMENT");
  const hours = await getBusinessHours();

  return (
    <div className="max-w-xl">
      <Link href="/management" className="text-sm text-brand-700 hover:underline">
        ← Back to Management
      </Link>

      <h1 className="mt-3 text-xl font-semibold">Business Hours</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Used to decide when a new website lead is "after hours" and gets the automatic
        we&rsquo;re-closed reply. Times are Pacific.
      </p>

      <form action={setBusinessHoursAction} className="mt-6 space-y-5 rounded-lg border border-neutral-200 bg-white p-6">
        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700">Open days</p>
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((d) => (
              <label key={d.key} className="flex items-center gap-1.5 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  name={`day_${d.key}`}
                  defaultChecked={hours.weekdays.includes(d.iso)}
                  disabled={!canEdit}
                />
                {d.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Opens at</label>
            <input
              type="time"
              name="startTime"
              defaultValue={toTimeInput(hours.startHour, hours.startMinute)}
              disabled={!canEdit}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Closes at</label>
            <input
              type="time"
              name="endTime"
              defaultValue={toTimeInput(hours.endHour, hours.endMinute)}
              disabled={!canEdit}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {canEdit && (
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Save
          </button>
        )}
      </form>
    </div>
  );
}
