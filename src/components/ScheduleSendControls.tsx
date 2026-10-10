"use client";

import { useState, useTransition } from "react";
import {
  scheduleMessageAction,
  type RecipientType,
  type ScheduleMessageResult,
} from "@/app/actions/scheduledMessages";
import { QUICK_PICKS, resolveQuickPick, isSmsQuietHours } from "@/lib/scheduledMessages";
import { zonedTimeToUtc } from "@/lib/timezone";

// Sits next to a Send button (LeadCommunicationPanel / CommunicationPanel)
// and schedules the exact subject/body already typed into that composer,
// instead of sending it now. Its own form is deliberately separate from the
// Send form above it — Send still fires immediately, unchanged.
export default function ScheduleSendControls({
  recipientType,
  recipientId,
  channel,
  getSubject,
  getBody,
  onScheduled,
}: {
  recipientType: RecipientType;
  recipientId: string;
  channel: "EMAIL" | "SMS";
  getSubject?: () => string;
  getBody: () => string;
  onScheduled?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sendAtLocal, setSendAtLocal] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ScheduleMessageResult | null>(null);

  const quietHoursPreview = channel === "SMS" && sendAtLocal ? isSmsQuietHours(zonedTimeToUtc(sendAtLocal)) : false;

  function applyQuickPick(pick: (typeof QUICK_PICKS)[number]["key"]) {
    setSendAtLocal(resolveQuickPick(pick));
  }

  function submit() {
    const body = getBody().trim();
    const subject = getSubject?.().trim() ?? "";
    if (!body) {
      setResult({ ok: false, error: "Write the message first." });
      return;
    }
    if (channel === "EMAIL" && !subject) {
      setResult({ ok: false, error: "Subject is required." });
      return;
    }
    if (!sendAtLocal) {
      setResult({ ok: false, error: "Pick a date and time." });
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("recipientType", recipientType);
      formData.set("recipientId", recipientId);
      formData.set("channel", channel);
      if (channel === "EMAIL") formData.set("subject", subject);
      formData.set("body", body);
      formData.set("sendAtLocal", sendAtLocal);

      const res = await scheduleMessageAction(formData);
      setResult(res);
      if (res.ok) {
        setOpen(false);
        setSendAtLocal("");
        onScheduled?.();
      }
    });
  }

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Schedule
      </button>

      {open && (
        <div className="mt-2 w-72 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PICKS.map((qp) => (
              <button
                key={qp.key}
                type="button"
                onClick={() => applyQuickPick(qp.key)}
                className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
              >
                {qp.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={sendAtLocal}
              onChange={(e) => setSendAtLocal(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <p className="text-[11px] text-neutral-500">Pacific time.</p>

          {quietHoursPreview && (
            <p className="rounded-md bg-amber-50 p-1.5 text-xs text-amber-800">
              ⚠️ This text is scheduled between 9pm and 8am.
            </p>
          )}

          {result && !result.ok && <p className="text-xs text-red-600">{result.error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Scheduling..." : "Schedule Send"}
          </button>
        </div>
      )}
    </div>
  );
}
