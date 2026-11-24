"use client";

import { useState, useTransition } from "react";
import type {
  RescheduleArrivalWindow,
  RescheduleCloseOutcome,
  RescheduleDecision,
  RescheduleFeeReview,
  RescheduleFrequency,
  RescheduleMessageStatus,
  RescheduleOfferOutcome,
  RescheduleType,
  RescheduleWorkStatus,
} from "@prisma/client";
import {
  claimRequestAction,
  markMatchedInTcsAction,
  markTcsUpdatedAction,
  markCustomerInformedAction,
  setFeeReviewAction,
  setConfirmedResultAction,
  approveRequestAction,
  completeRequestAction,
  declineRequestAction,
  closeWithdrawnAction,
  closeDuplicateAction,
  offerOptionAction,
  setOfferOutcomeAction,
  sendStaffMessageAction,
  addStaffNoteAction,
  revokeStatusTokenAction,
  markMessageNotSentAction,
  resendFailedMessageAction,
} from "./actions";

const TYPE_LABELS: Record<RescheduleType, string> = {
  MOVE_KEEP_SCHEDULE: "Move, keep schedule",
  MOVE_AND_RESTART: "Move and restart schedule",
  SKIP_ONE: "Skip one cleaning",
};
const ARRIVAL_WINDOW_LABELS: Record<RescheduleArrivalWindow, string> = {
  WINDOW_830_930: "8:30-9:30 AM",
  WINDOW_800_1130: "8:00-11:30 AM",
  WINDOW_1030_130: "10:30 AM-1:30 PM",
  WINDOW_1200_230: "12:00-2:30 PM",
  FLEXIBLE: "Flexible",
};
const FREQUENCY_LABELS: Record<RescheduleFrequency, string> = {
  WEEKLY: "Weekly",
  EVERY_2_WEEKS: "Every 2 weeks",
  EVERY_4_WEEKS: "Every 4 weeks",
  MONTHLY: "Monthly",
  NOT_SURE: "Not sure",
  OTHER: "Other",
};

export interface RescheduleRequestRowData {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  note: string | null;
  currentAppointmentDate: string;
  type: RescheduleType;
  chosenOptionDate: string | null;
  chosenOptionBlock: string | null;
  chosenOptionWindow: string | null;
  preferredDateText: string | null;
  arrivalWindow: RescheduleArrivalWindow | null;
  frequency: RescheduleFrequency | null;
  workStatus: RescheduleWorkStatus;
  decision: RescheduleDecision;
  closeOutcome: RescheduleCloseOutcome | null;
  closeNote: string | null;
  claimedByName: string | null;
  matchedInTcsAt: string | null;
  tcsUpdatedAt: string | null;
  customerInformedAt: string | null;
  feeReview: RescheduleFeeReview;
  feeReviewNote: string | null;
  confirmedDate: string | null;
  confirmedWindow: string | null;
  confirmedOriginalOutcome: string | null;
  confirmedRecurrenceText: string | null;
  confirmedFeeNotice: string | null;
  offerOptionDate: string | null;
  offerOptionBlock: string | null;
  offerOptionWindow: string | null;
  offerAt: string | null;
  offerText: string | null;
  offerOutcome: RescheduleOfferOutcome | null;
  messages: {
    id: string;
    channel: "EMAIL" | "SMS";
    kind: string;
    status: RescheduleMessageStatus;
    body: string;
    errorMessage: string | null;
    sentAt: string | null;
    createdAt: string;
  }[];
  notes: { id: string; body: string; authorName: string | null; createdAt: string }[];
  badges: {
    appointmentWithin7Days: boolean;
    pickupOverdue: boolean;
    responseDue48h: boolean;
    oddDate: boolean;
    messageFailed: boolean;
    possibleDuplicate: boolean;
    dateOnlyPreference: boolean;
    earlierRequestAhead: boolean;
  };
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "amber" | "red" }) {
  const toneClass =
    tone === "amber" ? "bg-amber-100 text-amber-800" : tone === "red" ? "bg-red-100 text-red-800" : "bg-neutral-100 text-neutral-700";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>{children}</span>;
}

export default function RescheduleRequestRow({ request: r, canEdit }: { request: RescheduleRequestRowData; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [feeReview, setFeeReviewLocal] = useState(r.feeReview);
  const [feeReviewNote, setFeeReviewNote] = useState(r.feeReviewNote ?? "");
  const [confirmedDate, setConfirmedDate] = useState(r.confirmedDate ?? "");
  const [confirmedWindow, setConfirmedWindow] = useState(r.confirmedWindow ?? "");
  const [confirmedOriginalOutcome, setConfirmedOriginalOutcome] = useState(r.confirmedOriginalOutcome ?? "");
  const [confirmedRecurrenceText, setConfirmedRecurrenceText] = useState(r.confirmedRecurrenceText ?? "");
  const [confirmedFeeNotice, setConfirmedFeeNotice] = useState(r.confirmedFeeNotice ?? "");
  const [declineNote, setDeclineNote] = useState("");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [duplicateNote, setDuplicateNote] = useState("");
  const [offerDate, setOfferDate] = useState(r.chosenOptionDate ?? "");
  const [offerBlock, setOfferBlock] = useState(r.chosenOptionBlock ?? "");
  const [offerWindow, setOfferWindow] = useState(r.chosenOptionWindow ?? "");
  const [offerText, setOfferText] = useState("");
  const [messageChannel, setMessageChannel] = useState<"EMAIL" | "SMS">("EMAIL");
  const [messageBody, setMessageBody] = useState(() =>
    r.confirmedDate
      ? [
          `Hi ${r.name.split(" ")[0]},`,
          `Your schedule change request has an update.`,
          r.confirmedDate && r.confirmedWindow ? `New date: ${r.confirmedDate}, ${r.confirmedWindow}.` : "",
          r.confirmedOriginalOutcome ? `Your original appointment: ${r.confirmedOriginalOutcome}.` : "",
          r.confirmedRecurrenceText ? `Going forward: ${r.confirmedRecurrenceText}.` : "",
          r.confirmedFeeNotice ? r.confirmedFeeNotice : "",
        ]
          .filter(Boolean)
          .join(" ")
      : ""
  );
  const [noteBody, setNoteBody] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string } | void>) {
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result && !result.ok && result.error) setError(result.error);
    });
  }

  const badgeList: { show: boolean; label: string; tone: "amber" | "red" }[] = [
    { show: r.badges.appointmentWithin7Days, label: "Appointment within 7 days", tone: "amber" },
    { show: r.badges.pickupOverdue, label: "Pickup overdue", tone: "red" },
    { show: r.badges.responseDue48h, label: "48h response due", tone: "red" },
    { show: r.badges.oddDate, label: "Odd date", tone: "amber" },
    { show: r.badges.messageFailed, label: "Message failed", tone: "red" },
    { show: r.badges.possibleDuplicate, label: "Possible duplicate", tone: "amber" },
    { show: r.badges.dateOnlyPreference, label: "Date-only — needs review", tone: "amber" },
    { show: r.badges.earlierRequestAhead, label: "Earlier request ahead", tone: "amber" },
  ];

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900">
            {r.name} · {TYPE_LABELS[r.type]}
          </p>
          <p className="text-xs text-neutral-500">
            Submitted {new Date(r.createdAt).toLocaleString()} · Current appointment {r.currentAppointmentDate}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {badgeList
              .filter((b) => b.show)
              .map((b) => (
                <Badge key={b.label} tone={b.tone}>
                  {b.label}
                </Badge>
              ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">
            {r.workStatus === "CLOSED" ? `Closed — ${r.closeOutcome ?? ""}` : r.workStatus.replace(/_/g, " ")} · {r.decision}
          </span>
          {canEdit && !r.claimedByName && r.workStatus !== "CLOSED" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => claimRequestAction(r.id))}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50"
            >
              Claim
            </button>
          )}
          {r.claimedByName && <span className="text-xs text-neutral-500">Claimed by {r.claimedByName}</span>}
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-brand-700 underline">
            {open ? "Hide details" : "Details"}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}

      {open && (
        <div className="mt-4 space-y-4 border-t border-neutral-100 pt-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <p>
              <span className="font-medium text-neutral-900">Email:</span> {r.email}
            </p>
            <p>
              <span className="font-medium text-neutral-900">Phone:</span> {r.phone ?? "—"}
            </p>
            <p>
              <span className="font-medium text-neutral-900">Address:</span> {r.address ?? "—"}
            </p>
            <p>
              <span className="font-medium text-neutral-900">Arrival preference:</span>{" "}
              {r.arrivalWindow ? ARRIVAL_WINDOW_LABELS[r.arrivalWindow] : "—"}
            </p>
            <p>
              <span className="font-medium text-neutral-900">Frequency:</span> {r.frequency ? FREQUENCY_LABELS[r.frequency] : "—"}
            </p>
            <p>
              <span className="font-medium text-neutral-900">Requested time:</span>{" "}
              {r.chosenOptionDate ? `${r.chosenOptionDate} · ${r.chosenOptionBlock}` : r.preferredDateText ?? "—"}
            </p>
          </div>
          {r.note && (
            <p>
              <span className="font-medium text-neutral-900">Note:</span> {r.note}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canEdit || pending || !!r.matchedInTcsAt}
              onClick={() => run(() => markMatchedInTcsAction(r.id))}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium disabled:opacity-50"
            >
              {r.matchedInTcsAt ? `Matched in TCS ✓` : "Mark: Client and appointment matched in TCS"}
            </button>
            <button
              type="button"
              disabled={!canEdit || pending || !!r.tcsUpdatedAt}
              onClick={() => run(() => markTcsUpdatedAction(r.id))}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium disabled:opacity-50"
            >
              {r.tcsUpdatedAt ? "TCS updated ✓" : "Mark: TCS updated by hand"}
            </button>
            <button
              type="button"
              disabled={!canEdit || pending || !!r.customerInformedAt}
              onClick={() => run(() => markCustomerInformedAction(r.id))}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium disabled:opacity-50"
            >
              {r.customerInformedAt ? "Customer informed ✓" : "Mark: Customer informed"}
            </button>
          </div>

          <div className="rounded-md border border-neutral-200 p-3">
            <p className="mb-2 font-medium text-neutral-900">Fee review (staff-only — never computed)</p>
            <div className="flex flex-wrap items-end gap-2">
              <select
                disabled={!canEdit}
                value={feeReview}
                onChange={(e) => setFeeReviewLocal(e.target.value as RescheduleFeeReview)}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
              >
                <option value="NOT_DECIDED">Not decided</option>
                <option value="NO_FEE">No fee applies</option>
                <option value="FEE_APPLIES">Fee applies</option>
              </select>
              <input
                disabled={!canEdit}
                value={feeReviewNote}
                onChange={(e) => setFeeReviewNote(e.target.value)}
                placeholder="Optional note"
                className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs"
              />
              <button
                type="button"
                disabled={!canEdit || pending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("id", r.id);
                  fd.set("feeReview", feeReview);
                  fd.set("feeReviewNote", feeReviewNote);
                  run(async () => {
                    await setFeeReviewAction(fd);
                  });
                }}
                className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="rounded-md border border-neutral-200 p-3">
            <p className="mb-2 font-medium text-neutral-900">Confirmed result (prefills the final message)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="date" disabled={!canEdit} value={confirmedDate} onChange={(e) => setConfirmedDate(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs" />
              <input
                disabled={!canEdit}
                value={confirmedWindow}
                onChange={(e) => setConfirmedWindow(e.target.value)}
                placeholder="Window, e.g. 8:30-9:30 AM"
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
              />
              <input
                disabled={!canEdit}
                value={confirmedOriginalOutcome}
                onChange={(e) => setConfirmedOriginalOutcome(e.target.value)}
                placeholder="What happens to the original appointment"
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs sm:col-span-2"
              />
              <input
                disabled={!canEdit}
                value={confirmedRecurrenceText}
                onChange={(e) => setConfirmedRecurrenceText(e.target.value)}
                placeholder="Recurrence in words, e.g. 'every 2 weeks going forward'"
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs sm:col-span-2"
              />
              <input
                disabled={!canEdit}
                value={confirmedFeeNotice}
                onChange={(e) => setConfirmedFeeNotice(e.target.value)}
                placeholder="Fee/rate notice shown to the customer (e.g. 'No fee applies')"
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs sm:col-span-2"
              />
            </div>
            <button
              type="button"
              disabled={!canEdit || pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("id", r.id);
                fd.set("confirmedDate", confirmedDate);
                fd.set("confirmedWindow", confirmedWindow);
                fd.set("confirmedOriginalOutcome", confirmedOriginalOutcome);
                fd.set("confirmedRecurrenceText", confirmedRecurrenceText);
                fd.set("confirmedFeeNotice", confirmedFeeNotice);
                run(() => setConfirmedResultAction(fd));
              }}
              className="mt-2 rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Save confirmed result
            </button>
          </div>

          {r.workStatus !== "CLOSED" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canEdit || pending || !r.matchedInTcsAt || r.decision === "APPROVED"}
                onClick={() => run(() => approveRequestAction(r.id))}
                className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                title={!r.matchedInTcsAt ? "Requires: client and appointment matched in TCS" : undefined}
              >
                Approve
              </button>
              <button
                type="button"
                disabled={!canEdit || pending}
                onClick={() => run(() => completeRequestAction(r.id))}
                className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Complete
              </button>
            </div>
          )}

          {r.workStatus !== "CLOSED" && (
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-neutral-200 p-2">
                <p className="mb-1 text-xs font-medium text-neutral-900">Decline</p>
                <textarea
                  disabled={!canEdit}
                  value={declineNote}
                  onChange={(e) => setDeclineNote(e.target.value)}
                  placeholder="Note shown to the customer (required)"
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
                  rows={2}
                />
                <button
                  type="button"
                  disabled={!canEdit || pending || !r.customerInformedAt || !declineNote.trim()}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("id", r.id);
                    fd.set("note", declineNote);
                    run(() => declineRequestAction(fd));
                  }}
                  className="mt-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-50"
                  title={!r.customerInformedAt ? "Requires: customer informed" : undefined}
                >
                  Decline
                </button>
              </div>
              <div className="rounded-md border border-neutral-200 p-2">
                <p className="mb-1 text-xs font-medium text-neutral-900">Withdrawn</p>
                <textarea
                  disabled={!canEdit}
                  value={withdrawNote}
                  onChange={(e) => setWithdrawNote(e.target.value)}
                  placeholder="Note (required)"
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
                  rows={2}
                />
                <button
                  type="button"
                  disabled={!canEdit || pending || !withdrawNote.trim()}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("id", r.id);
                    fd.set("note", withdrawNote);
                    run(() => closeWithdrawnAction(fd));
                  }}
                  className="mt-1 rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium disabled:opacity-50"
                >
                  Close: Withdrawn
                </button>
              </div>
              <div className="rounded-md border border-neutral-200 p-2">
                <p className="mb-1 text-xs font-medium text-neutral-900">Duplicate / invalid</p>
                <textarea
                  disabled={!canEdit}
                  value={duplicateNote}
                  onChange={(e) => setDuplicateNote(e.target.value)}
                  placeholder="Note (required)"
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
                  rows={2}
                />
                <button
                  type="button"
                  disabled={!canEdit || pending || !duplicateNote.trim()}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("id", r.id);
                    fd.set("note", duplicateNote);
                    run(() => closeDuplicateAction(fd));
                  }}
                  className="mt-1 rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium disabled:opacity-50"
                >
                  Close: Duplicate/invalid
                </button>
              </div>
            </div>
          )}

          <div className="rounded-md border border-neutral-200 p-3">
            <p className="mb-2 font-medium text-neutral-900">Offer an opening (FIFO-checked)</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input type="date" disabled={!canEdit} value={offerDate} onChange={(e) => setOfferDate(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs" />
              <input disabled={!canEdit} value={offerBlock} onChange={(e) => setOfferBlock(e.target.value)} placeholder="Block" className="rounded-md border border-neutral-300 px-2 py-1 text-xs" />
              <input disabled={!canEdit} value={offerWindow} onChange={(e) => setOfferWindow(e.target.value)} placeholder="Window" className="rounded-md border border-neutral-300 px-2 py-1 text-xs" />
            </div>
            <textarea
              disabled={!canEdit}
              value={offerText}
              onChange={(e) => setOfferText(e.target.value)}
              placeholder="Message proposing this time"
              className="mt-2 w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
              rows={2}
            />
            <button
              type="button"
              disabled={!canEdit || pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("id", r.id);
                fd.set("date", offerDate);
                fd.set("block", offerBlock);
                fd.set("window", offerWindow);
                fd.set("text", offerText);
                run(() => offerOptionAction(fd));
              }}
              className="mt-2 rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Make Offer
            </button>
            {r.offerOptionDate && (
              <div className="mt-2 text-xs text-neutral-700">
                <p>
                  Current offer: {r.offerOptionDate} · {r.offerOptionBlock} · {r.offerOptionWindow} — {r.offerOutcome}
                </p>
                {r.offerOutcome === "OPEN" && (
                  <div className="mt-1 flex gap-2">
                    <button type="button" disabled={!canEdit || pending} onClick={() => run(() => setOfferOutcomeAction(r.id, "DECLINED"))} className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-50">
                      Mark offer declined
                    </button>
                    <button type="button" disabled={!canEdit || pending} onClick={() => run(() => setOfferOutcomeAction(r.id, "WITHDRAWN"))} className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-50">
                      Withdraw offer
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-md border border-neutral-200 p-3">
            <p className="mb-2 font-medium text-neutral-900">Send a message (queued, shown before sending)</p>
            <div className="flex items-center gap-2">
              <select disabled={!canEdit} value={messageChannel} onChange={(e) => setMessageChannel(e.target.value as "EMAIL" | "SMS")} className="rounded-md border border-neutral-300 px-2 py-1 text-xs">
                <option value="EMAIL">Email</option>
                <option value="SMS" disabled={!r.phone}>
                  Text {r.phone ? "" : "(no phone on file)"}
                </option>
              </select>
            </div>
            <textarea disabled={!canEdit} value={messageBody} onChange={(e) => setMessageBody(e.target.value)} className="mt-2 w-full rounded-md border border-neutral-300 px-2 py-1 text-xs" rows={3} />
            <button
              type="button"
              disabled={!canEdit || pending || !messageBody.trim()}
              onClick={() => {
                const fd = new FormData();
                fd.set("id", r.id);
                fd.set("channel", messageChannel);
                fd.set("body", messageBody);
                run(() => sendStaffMessageAction(fd));
              }}
              className="mt-2 rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>

          <div>
            <p className="mb-1 font-medium text-neutral-900">Message log</p>
            {r.messages.length === 0 ? (
              <p className="text-xs text-neutral-500">No messages yet.</p>
            ) : (
              <ul className="space-y-1 text-xs text-neutral-700">
                {r.messages.map((m) => (
                  <li key={m.id} className="rounded-md border border-neutral-100 p-2">
                    <p>
                      {m.kind === "RECEIPT" ? "Automatic receipt" : "Staff message"} · {m.channel} · {m.status} ·{" "}
                      {new Date(m.createdAt).toLocaleString()}
                    </p>
                    {m.errorMessage && <p className="text-red-700">{m.errorMessage}</p>}
                    {canEdit && m.status === "PENDING" && (
                      <button type="button" disabled={pending} onClick={() => run(() => markMessageNotSentAction(m.id))} className="mt-1 rounded-md border border-neutral-300 px-2 py-0.5 text-xs">
                        Mark not sent
                      </button>
                    )}
                    {canEdit && m.status === "FAILED" && (
                      <button type="button" disabled={pending} onClick={() => run(() => resendFailedMessageAction(m.id))} className="mt-1 rounded-md border border-neutral-300 px-2 py-0.5 text-xs">
                        Resend
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1 font-medium text-neutral-900">Internal notes (never shown to the customer)</p>
            {r.notes.map((n) => (
              <p key={n.id} className="text-xs text-neutral-700">
                {n.authorName ?? "Staff"} ({new Date(n.createdAt).toLocaleString()}): {n.body}
              </p>
            ))}
            <div className="mt-1 flex gap-2">
              <input disabled={!canEdit} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs" placeholder="Add a note" />
              <button
                type="button"
                disabled={!canEdit || pending || !noteBody.trim()}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("id", r.id);
                  fd.set("body", noteBody);
                  run(async () => {
                    await addStaffNoteAction(fd);
                    setNoteBody("");
                  });
                }}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
              >
                Add
              </button>
            </div>
          </div>

          <button type="button" disabled={!canEdit || pending} onClick={() => run(() => revokeStatusTokenAction(r.id))} className="text-xs text-red-700 underline disabled:opacity-50">
            Revoke status link
          </button>
        </div>
      )}
    </div>
  );
}
