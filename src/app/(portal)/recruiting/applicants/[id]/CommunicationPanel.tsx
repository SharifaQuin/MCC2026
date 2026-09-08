"use client";

import { useState, useTransition } from "react";
import { sendApplicantEmailAction, sendApplicantTextAction } from "../actions";

interface CommEntry {
  id: string;
  channel: "EMAIL" | "SMS";
  direction: "OUTBOUND" | "INBOUND";
  subject: string | null;
  body: string;
  status: "SENT" | "FAILED";
  errorMessage: string | null;
  createdAt: string;
  sentByName: string | null;
}

function CommRow({ entry }: { entry: CommEntry }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          {entry.channel === "EMAIL" ? "📧 Email" : "💬 Text"}
          {entry.sentByName ? ` — ${entry.sentByName}` : ""}
        </span>
        <span>{new Date(entry.createdAt).toLocaleString()}</span>
      </div>
      {entry.subject && <p className="mt-1 text-sm font-medium text-neutral-900">{entry.subject}</p>}
      <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{entry.body}</p>
      {entry.status === "FAILED" && (
        <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
          Failed to send: {entry.errorMessage}
        </p>
      )}
    </div>
  );
}

export default function CommunicationPanel({
  applicantId,
  history,
}: {
  applicantId: string;
  history: CommEntry[];
}) {
  const [tab, setTab] = useState<"none" | "email" | "sms">("none");
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium text-neutral-900">Communication History</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab(tab === "email" ? "none" : "email")}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Send Email
          </button>
          <button
            type="button"
            onClick={() => setTab(tab === "sms" ? "none" : "sms")}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Send Text
          </button>
        </div>
      </div>

      {tab === "email" && (
        <form
          action={(formData) =>
            startTransition(async () => {
              await sendApplicantEmailAction(applicantId, formData);
              setTab("none");
            })
          }
          className="mb-4 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3"
        >
          <input
            name="subject"
            placeholder="Subject"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <textarea
            name="body"
            placeholder="Message"
            rows={4}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Sending..." : "Send Email"}
          </button>
        </form>
      )}

      {tab === "sms" && (
        <form
          action={(formData) =>
            startTransition(async () => {
              await sendApplicantTextAction(applicantId, formData);
              setTab("none");
            })
          }
          className="mb-4 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3"
        >
          <textarea
            name="body"
            placeholder="Text message"
            rows={3}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Sending..." : "Send Text"}
          </button>
        </form>
      )}

      {history.length === 0 ? (
        <p className="text-sm text-neutral-400">No emails or texts yet.</p>
      ) : (
        <div className="space-y-2">
          {history.map((entry) => (
            <CommRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
