"use client";

import { useState, useTransition } from "react";
import {
  updateScheduledMessageAction,
  cancelScheduledMessageAction,
  type RecipientType,
} from "@/app/actions/scheduledMessages";
import { isSmsQuietHours } from "@/lib/scheduledMessages";
import { zonedTimeToUtc } from "@/lib/timezone";

export interface ScheduledMessageRow {
  id: string;
  recipientType: RecipientType;
  recipientId: string;
  recipientName: string;
  channel: "EMAIL" | "SMS";
  subject: string | null;
  body: string;
  sendAtIso: string;
  sendAtDisplay: string;
  status: "PENDING" | "FAILED";
  errorMessage: string | null;
  quietHours: boolean;
  canEdit: boolean;
}

// For the datetime-local input's value — reads back as the same Pacific
// wall-clock string zonedTimeToUtc expects, since sendAtIso was produced
// from that same UTC instant.
function toLocalInputValue(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function Row({ row }: { row: ScheduledMessageRow }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(row.subject ?? "");
  const [body, setBody] = useState(row.body);
  const [sendAtLocal, setSendAtLocal] = useState(toLocalInputValue(row.sendAtIso));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const previewQuietHours = row.channel === "SMS" && sendAtLocal ? isSmsQuietHours(zonedTimeToUtc(sendAtLocal)) : false;

  function save() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("subject", subject);
      formData.set("body", body);
      formData.set("sendAtLocal", sendAtLocal);
      const res = await updateScheduledMessageAction(row.id, formData);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save.");
        return;
      }
      setEditing(false);
    });
  }

  function cancel() {
    if (!confirm("Cancel this scheduled send?")) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelScheduledMessageAction(row.id);
      if (!res.ok) setError(res.error ?? "Couldn't cancel.");
    });
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-900">
            {row.recipientName}{" "}
            <span className="font-normal text-neutral-400">
              ({row.recipientType === "LEAD" ? "Lead" : "Applicant"})
            </span>
          </p>
          <p className="text-xs text-neutral-500">
            {row.channel === "EMAIL" ? "📧 Email" : "💬 Text"} · {row.sendAtDisplay} PT
            {row.quietHours && <span className="ml-1 text-amber-700">⚠️ quiet hours</span>}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            row.status === "FAILED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {row.status === "FAILED" ? "Failed" : "Pending"}
        </span>
      </div>

      {row.status === "FAILED" && row.errorMessage && (
        <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">Failed to send: {row.errorMessage}</p>
      )}

      {!editing ? (
        <>
          {row.subject && <p className="mt-2 text-sm font-medium text-neutral-800">{row.subject}</p>}
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{row.body}</p>
          {row.canEdit && row.status === "PENDING" && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Edit / Reschedule
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          {row.channel === "EMAIL" && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="datetime-local"
            value={sendAtLocal}
            onChange={(e) => setSendAtLocal(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-neutral-500">Pacific time.</p>
          {previewQuietHours && (
            <p className="rounded-md bg-amber-50 p-1.5 text-xs text-amber-800">
              ⚠️ This text is scheduled between 9pm and 8am.
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel edit
            </button>
          </div>
        </div>
      )}

      {error && !editing && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function ScheduledMessagesList({ rows }: { rows: ScheduledMessageRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-400">Nothing scheduled right now.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Row key={row.id} row={row} />
      ))}
    </div>
  );
}
