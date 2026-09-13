"use client";

import { useState, useTransition } from "react";
import {
  sendApplicantEmailAction,
  sendApplicantTextAction,
  logApplicantReplyAction,
} from "../actions";

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
  const isInbound = entry.direction === "INBOUND";
  return (
    <div
      className={`rounded-lg border p-3 ${
        isInbound ? "border-brand-200 bg-brand-50" : "border-neutral-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          {entry.channel === "EMAIL" ? "📧 Email" : "💬 Text"}
          {isInbound ? " — from applicant" : entry.sentByName ? ` — ${entry.sentByName}` : ""}
        </span>
        <span>{new Date(entry.createdAt).toLocaleString()}</span>
      </div>
      {entry.subject && <p className="mt-1 text-sm font-medium text-neutral-900">{entry.subject}</p>}
      <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{entry.body}</p>
      {isInbound && entry.sentByName && (
        <p className="mt-2 text-xs text-neutral-400">Logged by {entry.sentByName}</p>
      )}
      {entry.status === "FAILED" && (
        <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
          Failed to send: {entry.errorMessage}
        </p>
      )}
    </div>
  );
}

type PanelTab = "none" | "email" | "sms" | "logEmail" | "logSms";

export default function CommunicationPanel({
  applicantId,
  history,
}: {
  applicantId: string;
  history: CommEntry[];
}) {
  const [tab, setTab] = useState<PanelTab>("none");
  const [pending, startTransition] = useTransition();

  const emailHistory = history.filter((entry) => entry.channel === "EMAIL");
  const smsHistory = history.filter((entry) => entry.channel === "SMS");

  const toggle = (next: PanelTab) => setTab(tab === next ? "none" : next);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium text-neutral-900">Communication History</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => toggle("email")}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Send Email
          </button>
          <button
            type="button"
            onClick={() => toggle("sms")}
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

      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Email
            </h3>
            <button
              type="button"
              onClick={() => toggle("logEmail")}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              + Log a reply
            </button>
          </div>

          {tab === "logEmail" && (
            <form
              action={(formData) =>
                startTransition(async () => {
                  await logApplicantReplyAction(applicantId, "EMAIL", formData);
                  setTab("none");
                })
              }
              className="mb-2 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3"
            >
              <p className="text-xs text-neutral-500">
                Paste what the applicant said in their email reply — this just records it here,
                it doesn&apos;t send anything.
              </p>
              <input
                name="subject"
                placeholder="Subject (optional)"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <textarea
                name="body"
                placeholder="What they wrote"
                rows={3}
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {pending ? "Saving..." : "Log Reply"}
              </button>
            </form>
          )}

          {emailHistory.length === 0 ? (
            <p className="text-sm text-neutral-400">No emails yet.</p>
          ) : (
            <div className="space-y-2">
              {emailHistory.map((entry) => (
                <CommRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Text
            </h3>
            <button
              type="button"
              onClick={() => toggle("logSms")}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              + Log a reply
            </button>
          </div>

          {tab === "logSms" && (
            <form
              action={(formData) =>
                startTransition(async () => {
                  await logApplicantReplyAction(applicantId, "SMS", formData);
                  setTab("none");
                })
              }
              className="mb-2 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3"
            >
              <p className="text-xs text-neutral-500">
                Paste what the applicant texted back — this just records it here, it
                doesn&apos;t send anything.
              </p>
              <textarea
                name="body"
                placeholder="What they texted"
                rows={3}
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {pending ? "Saving..." : "Log Reply"}
              </button>
            </form>
          )}

          {smsHistory.length === 0 ? (
            <p className="text-sm text-neutral-400">No texts yet.</p>
          ) : (
            <div className="space-y-2">
              {smsHistory.map((entry) => (
                <CommRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
