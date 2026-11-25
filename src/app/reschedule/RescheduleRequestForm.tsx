"use client";

import { useRef, useState, useTransition } from "react";
import RescheduleTermsNotice from "@/components/RescheduleTermsNotice";
import { submitRescheduleRequestAction, type SubmitRescheduleResult } from "./actions";
import type { PublicOpenOption } from "@/lib/slotCapacitySummary";

const TYPE_OPTIONS = [
  { value: "MOVE_KEEP_SCHEDULE", label: "Move my cleaning — keep my regular schedule" },
  { value: "MOVE_AND_RESTART", label: "Move my cleaning and restart my schedule from the new date" },
  { value: "SKIP_ONE", label: "Skip this one cleaning" },
];

const ARRIVAL_WINDOW_OPTIONS = [
  { value: "WINDOW_830_930", label: "8:30-9:30 AM" },
  { value: "WINDOW_800_1130", label: "8:00-11:30 AM" },
  { value: "WINDOW_1030_130", label: "10:30 AM-1:30 PM" },
  { value: "WINDOW_1200_230", label: "12:00-2:30 PM" },
  { value: "FLEXIBLE", label: "Flexible" },
];

const FREQUENCY_OPTIONS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "EVERY_2_WEEKS", label: "Every 2 weeks" },
  { value: "EVERY_4_WEEKS", label: "Every 4 weeks" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "NOT_SURE", label: "Not sure" },
  { value: "OTHER", label: "Other" },
];

function formatOptionDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const RECHECK_NOTES: Record<string, string> = {
  NO_LONGER_OPEN: "Heads up: the time you chose is no longer showing as available. We'll follow up with alternatives.",
  FEED_REPLACED: "Heads up: our schedule for that period has since been updated. We'll follow up with available times.",
};

export default function RescheduleRequestForm({
  options,
  turnstileSiteKey,
}: {
  options: PublicOpenOption[];
  turnstileSiteKey: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState("MOVE_KEEP_SCHEDULE");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [currentAppointmentDate, setCurrentAppointmentDate] = useState("");
  const [arrivalWindow, setArrivalWindow] = useState("FLEXIBLE");
  const [frequency, setFrequency] = useState("");
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(options.length > 0 ? 0 : null);
  const [useOtherDate, setUseOtherDate] = useState(options.length === 0);
  const [preferredDateText, setPreferredDateText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitRescheduleResult | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const isMove = type !== "SKIP_ONE";
  const isMoveAndRestart = type === "MOVE_AND_RESTART";

  function submit() {
    const formData = new FormData();
    const honeypot = formRef.current?.querySelector<HTMLInputElement>('input[name="website"]')?.value ?? "";
    const turnstileResponse =
      formRef.current?.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value ?? "";

    formData.set("website", honeypot);
    formData.set("cf-turnstile-response", turnstileResponse);
    formData.set("name", name);
    formData.set("email", email);
    formData.set("phone", phone);
    formData.set("address", address);
    formData.set("note", note);
    formData.set("currentAppointmentDate", currentAppointmentDate);
    formData.set("type", type);

    if (isMove) {
      formData.set("arrivalWindow", arrivalWindow);
      if (isMoveAndRestart) formData.set("frequency", frequency);

      const chosen = !useOtherDate && selectedOptionIndex !== null ? options[selectedOptionIndex] : null;
      if (chosen) {
        formData.set("chosenOptionDate", chosen.date);
        formData.set("chosenOptionBlock", chosen.block);
        formData.set("chosenOptionFeedMonthId", chosen.feedMonthId);
      } else {
        formData.set("preferredDateText", preferredDateText);
      }
    }

    startTransition(async () => {
      setErrorMessage(null);
      const res = await submitRescheduleRequestAction(formData);
      if (!res.ok) {
        setErrorMessage(res.error);
        return;
      }
      setResult(res);
    });
  }

  if (result?.ok) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <h1 className="text-lg font-bold text-brand-800">Request received</h1>
        <p className="mt-3 text-sm text-neutral-700">
          This is a request only — your current appointment stays scheduled unless we confirm a change. We will
          respond within 48 hours.
        </p>
        {result.optionRecheck && RECHECK_NOTES[result.optionRecheck] && (
          <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">{RECHECK_NOTES[result.optionRecheck]}</p>
        )}
        {result.statusUrl && (
          <p className="mt-4 text-sm text-neutral-700">
            Check your request&rsquo;s status any time:{" "}
            <a href={result.statusUrl} className="font-medium text-brand-700 underline">
              {result.statusUrl}
            </a>
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={formRef} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-lg font-bold text-neutral-900">Request a schedule change</h1>
      <p className="mt-2 text-sm text-neutral-600">
        This is a request only — your current appointment stays scheduled unless we confirm a change. We will
        respond within 48 hours. To pause or end service, please call or email us instead of using this form.
      </p>

      <form
        action={() => submit()}
        className="mt-6 space-y-5"
      >
        {/* Honeypot — hidden from real visitors */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px]"
          defaultValue=""
        />

        <div>
          <label className="block text-sm font-medium text-neutral-700">What would you like to do?</label>
          <div className="mt-2 space-y-2">
            {TYPE_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm text-neutral-800">
                <input type="radio" name="type-choice" value={o.value} checked={type === o.value} onChange={() => setType(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-neutral-700">
              Name
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-neutral-700">
              Phone (optional)
            </label>
            <input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-neutral-700">
              Service address (optional)
            </label>
            <input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Helps us tell you apart from a same-name client"
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label htmlFor="currentAppointmentDate" className="block text-sm font-medium text-neutral-700">
            Your current appointment date
          </label>
          <input
            id="currentAppointmentDate"
            type="date"
            required
            value={currentAppointmentDate}
            onChange={(e) => setCurrentAppointmentDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm sm:w-56"
          />
        </div>

        {isMove && (
          <>
            <div>
              <p className="block text-sm font-medium text-neutral-700">
                Times we may be able to offer. Choosing one is a request, not a booking.
              </p>
              {options.length > 0 && (
                <div className="mt-2 space-y-2">
                  {options.map((o, i) => (
                    <label key={`${o.date}-${o.block}`} className="flex items-center gap-2 text-sm text-neutral-800">
                      <input
                        type="radio"
                        name="option-choice"
                        checked={!useOtherDate && selectedOptionIndex === i}
                        onChange={() => {
                          setUseOtherDate(false);
                          setSelectedOptionIndex(i);
                        }}
                      />
                      {formatOptionDate(o.date)} · {o.block}
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-sm text-neutral-800">
                    <input type="radio" name="option-choice" checked={useOtherDate} onChange={() => setUseOtherDate(true)} />
                    None of these work — I&rsquo;ll share a preferred date
                  </label>
                </div>
              )}
              {(options.length === 0 || useOtherDate) && (
                <textarea
                  value={preferredDateText}
                  onChange={(e) => setPreferredDateText(e.target.value)}
                  placeholder="Tell us your preferred date (or date range)"
                  className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  rows={2}
                />
              )}
            </div>

            <div>
              <label htmlFor="arrivalWindow" className="block text-sm font-medium text-neutral-700">
                Arrival window preference
              </label>
              <select
                id="arrivalWindow"
                value={arrivalWindow}
                onChange={(e) => setArrivalWindow(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm sm:w-64"
              >
                {ARRIVAL_WINDOW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {isMoveAndRestart && (
              <div>
                <label htmlFor="frequency" className="block text-sm font-medium text-neutral-700">
                  How often would you like cleanings going forward?
                </label>
                <select
                  id="frequency"
                  required
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm sm:w-64"
                >
                  <option value="" disabled>
                    Choose one
                  </option>
                  {FREQUENCY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        <div>
          <label htmlFor="note" className="block text-sm font-medium text-neutral-700">
            Anything else we should know? (optional)
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        <RescheduleTermsNotice />

        {turnstileSiteKey && (
          <>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
            <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
          </>
        )}

        {errorMessage && <p className="text-sm font-medium text-red-700">{errorMessage}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Submitting..." : "Submit Request"}
        </button>
      </form>
    </div>
  );
}
