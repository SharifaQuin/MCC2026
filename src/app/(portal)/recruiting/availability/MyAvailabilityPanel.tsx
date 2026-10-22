"use client";

import { useFormState, useFormStatus } from "react-dom";
import Button from "@/components/ds/Button";
import {
  saveAvailabilityConfigAction,
  addWeeklyHourAction,
  deleteWeeklyHourAction,
  addDateExceptionAction,
  deleteDateExceptionAction,
  type SaveAvailabilityConfigState,
} from "./interviewerActions";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export interface AvailabilityConfigData {
  timezone: string;
  durationMins: number;
  bufferBeforeMins: number;
  bufferAfterMins: number;
  supportsZoom: boolean;
  supportsInPerson: boolean;
}

export interface WeeklyHourData {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface DateExceptionData {
  id: string;
  date: string;
  type: "UNAVAILABLE" | "EXTRA_HOURS";
  startMinute: number | null;
  endMinute: number | null;
  note: string | null;
}

const initialState: SaveAvailabilityConfigState = {};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export default function MyAvailabilityPanel({
  interviewerId,
  config,
  weeklyHours,
  exceptions,
  timezoneOptions,
}: {
  interviewerId: string;
  config: AvailabilityConfigData | null;
  weeklyHours: WeeklyHourData[];
  exceptions: DateExceptionData[];
  timezoneOptions: string[];
}) {
  const [configState, configAction] = useFormState(
    saveAvailabilityConfigAction.bind(null, interviewerId),
    initialState
  );
  const [weeklyState, weeklyAction] = useFormState(addWeeklyHourAction.bind(null, interviewerId), initialState);
  const [exceptionState, exceptionAction] = useFormState(
    addDateExceptionAction.bind(null, interviewerId),
    initialState
  );

  return (
    <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-5">
      <div>
        <p className="mb-1 text-sm font-semibold text-brand-800">My Interview Availability</p>
        <p className="text-xs text-neutral-500">
          Your own recurring schedule — only you (or an Admin) can change it. Nothing here is guessed or
          auto-enabled; set it up below before candidates can book your time.
        </p>
      </div>

      <form action={configAction} className="space-y-3 border-b border-neutral-100 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">General settings</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
            Timezone
            <select
              name="timezone"
              defaultValue={config?.timezone ?? "America/Los_Angeles"}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
            Interview length (min)
            <input
              type="number"
              name="durationMins"
              min={5}
              max={240}
              defaultValue={config?.durationMins ?? 30}
              className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
            Buffer before (min)
            <input
              type="number"
              name="bufferBeforeMins"
              min={0}
              max={120}
              defaultValue={config?.bufferBeforeMins ?? 0}
              className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
            Buffer after (min)
            <input
              type="number"
              name="bufferAfterMins"
              min={0}
              max={120}
              defaultValue={config?.bufferAfterMins ?? 0}
              className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="supportsZoom" defaultChecked={config?.supportsZoom ?? true} />
            I conduct Zoom interviews
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="supportsInPerson" defaultChecked={config?.supportsInPerson ?? false} />
            I conduct in-person interviews
          </label>
        </div>
        <SubmitButton label="Save Settings" pendingLabel="Saving…" />
        {configState.error && <p className="text-sm text-red-600">{configState.error}</p>}
        {configState.success && <p className="text-sm text-green-700">Saved.</p>}
      </form>

      {config && (
        <>
          <div className="space-y-3 border-b border-neutral-100 pb-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Recurring weekly hours
            </p>
            {weeklyHours.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No recurring hours set yet — add at least one window below so candidates have times to book.
              </p>
            ) : (
              <ul className="space-y-1">
                {weeklyHours.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between rounded-md bg-neutral-50 px-3 py-2 text-sm"
                  >
                    <span>
                      {DAY_LABELS[h.dayOfWeek]}: {minutesToHHMM(h.startMinute)}–{minutesToHHMM(h.endMinute)}
                    </span>
                    <form action={deleteWeeklyHourAction.bind(null, interviewerId, h.id)}>
                      <button type="submit" className="text-xs font-medium text-red-600 hover:underline">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={weeklyAction} className="flex flex-wrap items-end gap-2">
              <select name="dayOfWeek" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
                {DAY_LABELS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
              <input type="time" name="startTime" required className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              <span className="text-sm text-neutral-500">to</span>
              <input type="time" name="endTime" required className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              <SubmitButton label="Add Window" pendingLabel="Adding…" />
            </form>
            {weeklyState.error && <p className="text-sm text-red-600">{weeklyState.error}</p>}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Date exceptions</p>
            {exceptions.length === 0 ? (
              <p className="text-sm text-neutral-500">No exceptions — time off or one-off extra hours go here.</p>
            ) : (
              <ul className="space-y-1">
                {exceptions.map((ex) => (
                  <li
                    key={ex.id}
                    className="flex items-center justify-between rounded-md bg-neutral-50 px-3 py-2 text-sm"
                  >
                    <span>
                      {ex.date}:{" "}
                      {ex.type === "UNAVAILABLE"
                        ? ex.startMinute === null
                          ? "Unavailable (whole day)"
                          : `Unavailable ${minutesToHHMM(ex.startMinute)}–${minutesToHHMM(ex.endMinute!)}`
                        : `Extra hours ${minutesToHHMM(ex.startMinute!)}–${minutesToHHMM(ex.endMinute!)}`}
                      {ex.note ? ` — ${ex.note}` : ""}
                    </span>
                    <form action={deleteDateExceptionAction.bind(null, interviewerId, ex.id)}>
                      <button type="submit" className="text-xs font-medium text-red-600 hover:underline">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={exceptionAction} className="flex flex-wrap items-end gap-2">
              <input type="date" name="date" required className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              <select name="type" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
                <option value="UNAVAILABLE">Unavailable</option>
                <option value="EXTRA_HOURS">Extra hours</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-neutral-600">
                <input type="checkbox" name="wholeDay" defaultChecked />
                Whole day
              </label>
              <input type="time" name="startTime" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              <span className="text-sm text-neutral-500">to</span>
              <input type="time" name="endTime" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              <input
                type="text"
                name="note"
                placeholder="Note (optional)"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
              <SubmitButton label="Add Exception" pendingLabel="Adding…" />
            </form>
            {exceptionState.error && <p className="text-sm text-red-600">{exceptionState.error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
